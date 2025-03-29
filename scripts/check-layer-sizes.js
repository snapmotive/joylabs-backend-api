const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define the layers to check
const layers = [
  'core',
  'api-deps',
  'catalog-deps',
  'webhooks-deps',
  'oauth-deps',
  'square'
];

// Function to calculate directory size in MB
function getDirSizeInMB(dirPath) {
  try {
    // Using du command on macOS/Linux to get directory size
    const output = execSync(`du -sh ${dirPath}`, { encoding: 'utf-8' });
    const sizeStr = output.trim().split('\t')[0];
    
    // Convert to MB for consistency
    if (sizeStr.endsWith('K')) {
      return parseFloat(sizeStr.replace('K', '')) / 1024;
    } else if (sizeStr.endsWith('M')) {
      return parseFloat(sizeStr.replace('M', ''));
    } else if (sizeStr.endsWith('G')) {
      return parseFloat(sizeStr.replace('G', '')) * 1024;
    } else {
      return parseFloat(sizeStr) / (1024 * 1024);
    }
  } catch (error) {
    console.error(`Error calculating size for ${dirPath}:`, error.message);
    return 0;
  }
}

// Check layer sizes
console.log('Lambda Layer Sizes:');
console.log('-------------------');

let totalSize = 0;
const layerSizes = {};

layers.forEach(layer => {
  const layerPath = path.join(__dirname, '..', 'layers', layer, 'nodejs');
  if (fs.existsSync(layerPath)) {
    const size = getDirSizeInMB(layerPath);
    layerSizes[layer] = size;
    totalSize += size;
    console.log(`${layer}: ${size.toFixed(2)} MB`);
  } else {
    console.log(`${layer}: [Directory not found]`);
  }
});

console.log('-------------------');
console.log(`Total Layer Size: ${totalSize.toFixed(2)} MB`);

// Now check function sizes after webpack
console.log('\nWebpack Function Sizes:');
console.log('----------------------');

const webpackDir = path.join(__dirname, '..', '.webpack');
if (fs.existsSync(webpackDir)) {
  const functionFiles = fs.readdirSync(webpackDir)
    .filter(file => file.endsWith('.js') && !file.endsWith('.map'));
  
  let totalFunctionSize = 0;
  
  functionFiles.forEach(file => {
    const filePath = path.join(webpackDir, file);
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    totalFunctionSize += fileSizeMB;
    console.log(`${file}: ${fileSizeMB.toFixed(2)} MB`);
  });
  
  console.log('----------------------');
  console.log(`Total Function Size: ${totalFunctionSize.toFixed(2)} MB`);
} else {
  console.log('Webpack directory not found. Run "serverless package" first.');
}

// Estimate total Lambda size (layers + function code)
console.log('\nEstimated Lambda Sizes (Function + Referenced Layers):');
console.log('-----------------------------------------------------');

const layersByFunction = {
  'api': ['core', 'api-deps', 'square'],
  'catalog': ['core', 'catalog-deps', 'square'],
  'webhooks': ['core', 'webhooks-deps', 'square'],
  'oauth': ['core', 'oauth-deps', 'square']
};

// Helper to find function size from webpack output
function getFunctionSize(baseName) {
  const webpackDir = path.join(__dirname, '..', '.webpack');
  if (!fs.existsSync(webpackDir)) return 0;
  
  // Account for webpack's naming pattern (src/file.js -> src/file.js)
  const possibleNames = [
    `src/${baseName}.js`, 
    `src/${baseName}Handlers.js`,
    `${baseName}.js`,
    `${baseName}Handlers.js`
  ];
  
  for (const name of possibleNames) {
    const filePath = path.join(webpackDir, name);
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).size / (1024 * 1024);
    }
  }
  
  return 0;
}

Object.keys(layersByFunction).forEach(func => {
  const functionSize = getFunctionSize(func);
  const layers = layersByFunction[func];
  let totalLayerSize = 0;
  
  layers.forEach(layer => {
    if (layerSizes[layer]) {
      totalLayerSize += layerSizes[layer];
    }
  });
  
  const totalSize = functionSize + totalLayerSize;
  console.log(`${func}: ${functionSize.toFixed(2)} MB (code) + ${totalLayerSize.toFixed(2)} MB (layers) = ${totalSize.toFixed(2)} MB`);
  
  // AWS Lambda size limit warnings
  if (totalSize > 250) {
    console.log(`  ⚠️ WARNING: ${func} exceeds the Lambda size limit of 250 MB!`);
  } else if (totalSize > 200) {
    console.log(`  ⚠️ WARNING: ${func} is approaching the Lambda size limit (>80%)!`);
  }
});

console.log('\nNOTE: These are estimates. Actual deployed sizes may vary slightly.');
console.log('The AWS Lambda size limit is 250 MB for the function + layers combined.'); 