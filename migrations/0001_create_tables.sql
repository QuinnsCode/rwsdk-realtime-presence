-- Create User table
CREATE TABLE User (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create Credential table
CREATE TABLE Credential (
  id TEXT PRIMARY KEY,
  userId TEXT UNIQUE NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  credentialId TEXT UNIQUE NOT NULL,
  publicKey BLOB NOT NULL,
  counter INTEGER DEFAULT 0,
  FOREIGN KEY (userId) REFERENCES User (id)
);

-- Create indexes
CREATE INDEX idx_credential_credentialId ON Credential(credentialId);
CREATE INDEX idx_credential_userId ON Credential(userId);
