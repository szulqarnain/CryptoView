const express = require("express");
const {
    getNftMetadata,
    getTransactions,
    queryTransactions
} = require("../controllers/taskController.js");

const router = express.Router();

router.post("/nft-metadata", getNftMetadata);
router.post("/get-transactions", getTransactions);
router.post("/query-transactions", queryTransactions);

module.exports = router;