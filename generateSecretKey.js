const crypto = require('crypto');

// Generate 64 random bytes and convert to a hexadecimal string
const secretKey = crypto.randomBytes(64).toString('hex');

// Output the secret key
console.log('Generated JWT Secret Key:', secretKey);
