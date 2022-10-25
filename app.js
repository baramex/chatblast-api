require("dotenv").config();
const mongoose = require("mongoose");
const { app } = require("./server");
mongoose.connect(process.env.DB, { dbName: process.env.DB_NAME });

require("./models/subscription.model");

app.use(require("./api/authentification"), require("./api/profile"), require("./api/message"), require("./api/integration"), require("./api/communication"), require("./api/payment"));