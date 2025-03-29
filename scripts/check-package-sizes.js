/**
 * Script to check AWS Lambda package sizes before deployment
 * This helps identify functions that are approaching the 50MB limit
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const statAsync = promisify(fs.stat);
const readDirAsync = promisify(fs.readdir);

// Lambda size limits
const SIZE_LIMIT_MB = 50;
const WARNING_THRESHOLD_MB = 40;

// Directory where serverless packages functions
const SERVERLESS_DIR = path.join(__dirname, '..', '.serverless');

async function getDirectorySize(dirPath) {
  const files = await readDirAsync(dirPath);
  
  const sizes = await Promise.all(
    files.map(async file => {
      const filePath = path.join(dirPath, file);
      const stats = await statAsync(filePath);
      
      if (stats.isDirectory()) {
        return await getDirectorySize(filePath);
      } else {
        return stats.size;
      }
    })
  );
  
  return sizes.reduce((acc, size) => acc + size, 0);
}

async function checkZipSizes() {
  console.log('\n🔍 Checking Lambda package sizes...\n');
  
  try {
    if (!fs.existsSync(SERVERLESS_DIR)) {
      console.log('Running serverless package first...');
      execSync('serverless package', { stdio: 'inherit' });
    }
    
    const files = await readDirAsync(SERVERLESS_DIR);
    const zipFiles = files.filter(file => file.endsWith('.zip'));
    
    if (zipFiles.length === 0) {
      console.log('No zip files found. Run `serverless package` first.');
      return;
    }
    
    let hasWarnings = false;
    
    for (const zipFile of zipFiles) {
      const zipPath = path.join(SERVERLESS_DIR, zipFile);
      const stats = await statAsync(zipPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      const percentOfLimit = ((stats.size / (1024 * 1024)) / SIZE_LIMIT_MB * 100).toFixed(1);
      
      const functionName = zipFile.replace('.zip', '');
      
      let status = '✅';
      let message = '';
      
      if (sizeMB > SIZE_LIMIT_MB) {
        status = '❌';
        message = `EXCEEDS LIMIT (${percentOfLimit}%)`;
        hasWarnings = true;
      } else if (sizeMB > WARNING_THRESHOLD_MB) {
        status = '⚠️';
        message = `APPROACHING LIMIT (${percentOfLimit}%)`;
        hasWarnings = true;
      }
      
      console.log(`${status} ${functionName}: ${sizeMB} MB ${message}`);
    }
    
    console.log('\n📊 Size analysis summary:');
    console.log(`- Lambda limit: ${SIZE_LIMIT_MB} MB`);
    console.log(`- Warning threshold: ${WARNING_THRESHOLD_MB} MB`);
    
    if (hasWarnings) {
      console.log('\n⚠️ You have functions that are approaching or exceeding Lambda size limits.');
      console.log('Consider optimizing your code or moving more dependencies to layers.');
    } else {
      console.log('\n✅ All functions are within safe size limits.');
    }
  } catch (error) {
    console.error('Error checking zip sizes:', error);
    process.exit(1);
  }
}

checkZipSizes().catch(err => {
  console.error('Error:', err);
  process.exit(1);
}); 