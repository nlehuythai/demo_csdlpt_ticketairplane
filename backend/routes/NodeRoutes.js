const express = require('express');
const router = express.Router();
const GetNodes = require('../controllers/NodeController');
router.get('/', GetNodes.getNodes);
module.exports = router;