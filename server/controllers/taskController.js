const fetch = require('node-fetch'); 
const { db } = require('../models/workoutModel');
const Web3 = require('web3'); 
const process = require("process");

const web3 = new Web3("https://mainnet.infura.io/v3/1c6f4520acb54a82910b382e06e6bad0"); // pass the provider URL

// fetch nft metadata function 
const fetchNFTMetadata = async (contractAddress, tokenId) => {
  const contractABI = [
    {
      constant: true,
      inputs: [{ name: 'tokenId', type: 'uint256' }],
      name: 'tokenURI',
      outputs: [{ name: '', type: 'string' }],
      type: 'function',
    },
  ];
  const contract = new web3.eth.Contract(contractABI, contractAddress);


  const tokenURI = await contract.methods.tokenURI(tokenId).call();
  console.log("Token URI:", tokenURI);

  // resolve IPFS tokenURI
  let resolvedURI = tokenURI.startsWith("ipfs://")
    ? tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/")
    : tokenURI;

  if (!/^https?:\/\//i.test(resolvedURI)) {
    throw new Error("Invalid tokenURI: Must be an HTTP or HTTPS URL.");
  }

  // fetch metadata json from the resolved uri
  const response = await fetch(resolvedURI);
  if (!response.ok) throw new Error('Failed to fetch token metadata');
  
  const metadata = await response.json();

  if (metadata.image && metadata.image.startsWith("ipfs://")) {
    metadata.image = metadata.image.replace("ipfs://", "https://ipfs.io/ipfs/");
  }

  return metadata;
};

// save nft metadata to mongodb
const saveToMongoDB = async (metadata, contractAddress, tokenId) => {
  const collection = db.collection('nft_metadata'); 

  await collection.updateOne(
    { contractAddress, tokenId }, 
    { $set: { ...metadata, contractAddress, tokenId } }, 
    { upsert: true } 
  );

};

// fetch transaction from 
const fetchTransactions = async (address) => {
  const apiKey = process.env.ETHERSCAN_API;
  const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.status !== "1") {
    throw new Error(`Error from Etherscan API: ${data.message}`);
  }
 
  return data.result.slice(0, 5); // get last 5
};

// sve transaction to mongodb
const saveTransactionsToMongoDB = async (address, transactions) => {
  const collection = db.collection('crypto_transactions'); 

  const bulkOperations = transactions.map((txn) => ({
    updateOne: {
      filter: { hash: txn.hash },
      update: { $set: { ...txn, address } },
      upsert: true,
    },
  }));

  await collection.bulkWrite(bulkOperations);
};

// get nft metadata and then save in mongodb
const getNftMetadata = async (req, res) => {
  const { address, token } = req.body;

  console.log("process.env.INFURA_URL",process.env.INFURA_URL)
  if (!address || !token) {
    return res.status(400).json({ error: 'Missing contract address or token ID' });
  }

  try {
    const metadata = await fetchNFTMetadata(address, token);
    await saveToMongoDB(metadata, address, token); // save in mongo db

    res.status(200).json(metadata);  
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve NFT metadata' });
  }
};

// get address transactions and save in mongodb 
const getTransactions = async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: "Missing cryptocurrency address" });
  }

  try {
    const transactions = await fetchTransactions(address);

    await saveTransactionsToMongoDB(address, transactions);

    res.status(200).json({ message: "Transactions retrieved and stored", transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to retrieve or store transactions" });
  }
};

// query transaction from mongo db
const queryTransactions = async (req, res) => {
  const { address, startDate, endDate } = req.body;

  if (!address) {
    return res.status(400).json({ error: "Missing cryptocurrency address" });
  }

  try {
    const collection = db.collection('crypto_transactions');

    const query = {
      address,
      timeStamp: {
        $gte: new Date(startDate).getTime().toString(), // convert to timestamp in seconds
        $lte: new Date(endDate).getTime().toString(),
      },
    };

    const transactions = await collection.find(query).toArray();

    res.status(200).json({ transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to query transactions" });
  }
};


module.exports = { getNftMetadata, getTransactions, queryTransactions  };
