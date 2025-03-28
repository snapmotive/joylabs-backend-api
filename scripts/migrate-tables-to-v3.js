/**
 * DynamoDB Data Migration Script
 * 
 * This script migrates data from the old tables to the new v3 tables.
 * It preserves all data while ensuring compatibility with the new schema.
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const chalk = require('chalk');

// Configure AWS
const region = process.env.REGION || 'us-west-1';

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region,
  maxAttempts: 3,
  requestTimeout: 3000
});
const dynamoDB = DynamoDBDocumentClient.from(client);

// Table mapping (old to new)
const TABLE_MAPPING = {
  'joylabs-catalog-users': 'joylabs-catalog-users-v3',
  'joylabs-catalog-products': 'joylabs-catalog-products-v3',
  'joylabs-catalog-categories': 'joylabs-catalog-categories-v3',
  'joylabs-catalog-webhooks': 'joylabs-catalog-webhooks-v3',
  'joylabs-sessions': 'joylabs-sessions-v3'
};

// Environment/stage
const stage = process.env.NODE_ENV || 'development';

/**
 * Get the full table name with environment suffix
 * @param {string} baseName - Base table name
 * @returns {string} - Full table name
 */
function getTableName(baseName) {
  return `${baseName}-${stage}`;
}

/**
 * Scan all data from a table
 * @param {string} tableName - Table to scan
 * @returns {Array} - All items from the table
 */
async function scanTable(tableName) {
  console.log(chalk.blue(`Scanning table: ${tableName}`));
  
  const items = [];
  let lastEvaluatedKey = null;
  
  do {
    const params = {
      TableName: tableName,
      Limit: 100
    };
    
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    const response = await dynamoDB.send(new ScanCommand(params));
    items.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;
    
    console.log(chalk.gray(`  Scanned ${items.length} items so far...`));
  } while (lastEvaluatedKey);
  
  console.log(chalk.green(`  Found ${items.length} items in ${tableName}`));
  return items;
}

/**
 * Write items to a table in batches
 * @param {string} tableName - Target table
 * @param {Array} items - Items to write
 */
async function batchWriteItems(tableName, items) {
  console.log(chalk.blue(`Writing ${items.length} items to ${tableName}`));
  
  // Process in batches of 25 (DynamoDB batch write limit)
  const batchSize = 25;
  let processed = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const params = {
      RequestItems: {
        [tableName]: batch.map(item => ({
          PutRequest: {
            Item: item
          }
        }))
      }
    };
    
    await dynamoDB.send(new BatchWriteCommand(params));
    processed += batch.length;
    console.log(chalk.gray(`  Wrote ${processed}/${items.length} items...`));
  }
  
  console.log(chalk.green(`  Successfully wrote ${items.length} items to ${tableName}`));
}

/**
 * Add TTL attribute to items where missing
 * @param {Array} items - Items to process
 * @returns {Array} - Processed items
 */
function addTtlAttribute(items) {
  // Default TTL: 1 year from now
  const defaultTtl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
  
  return items.map(item => {
    if (!item.ttl) {
      return {
        ...item,
        ttl: defaultTtl
      };
    }
    return item;
  });
}

/**
 * Migrate data from source table to destination table
 * @param {string} sourceTable - Source table name
 * @param {string} destTable - Destination table name
 */
async function migrateTable(sourceTable, destTable) {
  try {
    console.log(chalk.yellow(`\n=== Migrating ${sourceTable} → ${destTable} ===`));
    
    // 1. Scan all data from source table
    const items = await scanTable(sourceTable);
    if (items.length === 0) {
      console.log(chalk.yellow(`  No items to migrate from ${sourceTable}`));
      return;
    }
    
    // 2. Add TTL attribute if missing
    const processedItems = addTtlAttribute(items);
    
    // 3. Write items to destination table
    await batchWriteItems(destTable, processedItems);
    
    console.log(chalk.green(`  Migration complete for ${sourceTable} → ${destTable}`));
  } catch (error) {
    console.error(chalk.red(`  Error migrating ${sourceTable} → ${destTable}:`));
    console.error(chalk.red(`  ${error.message}`));
  }
}

/**
 * Main migration function
 */
async function migrateAllTables() {
  console.log(chalk.yellow(`Starting data migration to v3 tables (${stage} environment)`));
  
  for (const [source, dest] of Object.entries(TABLE_MAPPING)) {
    const sourceTableName = getTableName(source);
    const destTableName = getTableName(dest);
    
    await migrateTable(sourceTableName, destTableName);
  }
  
  console.log(chalk.green(`\nMigration complete!`));
}

// Run migration if executed directly
if (require.main === module) {
  migrateAllTables().catch(error => {
    console.error(chalk.red(`Migration failed: ${error.message}`));
    process.exit(1);
  });
} 