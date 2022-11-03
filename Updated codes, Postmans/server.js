"use strict";
// loads enviroment variables
require("dotenv").config();

// Third Party requirements
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
var passport = require("passport");
var session = require("express-session");
const MongoStore = require("connect-mongo");
const morgan = require("morgan");
const cors = require("cors");
const multer = require('multer')
const upload = multer();

//allow cors
app.use(cors());
app.options("*", cors());
app.use(upload.any());
// local requirements

if (process.env.ENVIRONMENT == "sandbox") {
  mongoose.connect(
    process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
    () => {
      console.log(`connected to ${process.env.ENVIRONMENT} database`);
    }
  );
  app.use(
    cors({
      origin: "http://localhost:3000",
      methods: ["GET", "POST", "PUT"],
      credentials: true,
    })
  );
} else if (process.env.ENVIRONMENT == "prod") {
  mongoose.connect(
    process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
    () => {
      console.log(`connected to ${process.env.ENVIRONMENT} database`);
    }
  );
  app.use(
    cors({
      origin: "http://localhost:3000",
      methods: ["GET", "POST", "PUT"],
      credentials: true,
    })
  );
}

app.set("superSecret", process.env.SECRET_KEY); // secret variable
app.use(
  bodyParser.json({
    limit: "150mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(bodyParser.urlencoded({
  limit: "150mb",
  extended: true
}));
app.use(require("body-parser").json());
app.use(bodyParser.json({
  type: "application/json"
}));
const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error: "));
db.once("open", function() {
  console.log("Connected successfully");
});
mongoose.set("debug", true);
// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, company_code"
  );
  next();
});
console.log("after env check");
// configure midddlewares
require("./routes/index")(app, passport);
var listener = app.listen(process.env.PORT, function() {});