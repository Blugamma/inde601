const express = require("express");
const bodyParser = require(`body-parser`);
const app = express();
const port = 3000;
const request = require("request");
var path = require("path");
var MongoClient = require("mongodb").MongoClient;
var url = "mongodb://trainadmin:test123@ds251332.mlab.com:51332/traintrackar";
var mLab = require("mongolab-data-api")("QcMYUxzSPh1UFvwhGMNJHciyVqHemZmC");
var session = require("express-session");
var sess;

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);
app.use(express.static("www/public"));
app.use(
  session({
    secret: "traintrackarSecret"
  })
);

app.listen(port, () => {
  console.log(`App is listening to ${port}`);
});

app.post("/signUp", function(req, res) {
  console.log(req.body);
  MongoClient.connect(
    url,
    function(err, db) {
      if (err) throw err;
      var dbo = db.db("traintrackar");
      var myobj = req.body;
      dbo.collection("users").insertOne(myobj, function(err, res) {
        if (err) throw err;
        console.log("1 user inserted");
        db.close();
      });
    }
  );
  res.sendFile(__dirname + "/www/confirmed.html");
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/www/index.html");
});

app.get("/test", (req, res) => {
  res.sendFile(__dirname + "/www/test.html");
});

app.get("/about", (req, res) => {
  res.sendFile(__dirname + "/www/public/pages/about.html");
});

app.get("/contact", (req, res) => {
  res.sendFile(__dirname + "/www/public/pages/contact.html");
});

app.post("/login", function(req, res) {
  sess = req.session;
  var email = req.body.email;
  var pass = req.body.password;

  MongoClient.connect(
    url,
    function(err, db) {
      if (err) throw err;
      var dbo = db.db("traintrackar");
      dbo.collection("users").findOne(
        {
          email: email
        },
        function(err, result) {
          if (err) throw err;
          //console.log(result.email);
          // console.log(result.password);
          if (result.email === email && result.password === pass) {
            console.log("success");
            sess.email = result.email;
            res.redirect("/account-dashboard");
          } else {
            console.log("Credentials wrong");
          }
          db.close();
        }
      );
    }
  );
});
app.get("/account-dashboard", (req, res) => {
  sess = req.session;
  if (sess.email) {
    res.sendFile(__dirname + "/www/account-dashboard.html");
  } else {
    res.redirect("/");
  }
});

function updateTrainData() {
  request(
    "https://transportapi.com/v3/uk/train/station/PLY/live.json?app_id=2564b3aa&app_key=aca773df543a23bf176c9bba29674a06&darwin=false&destination=PNZ&train_status=passenger&origin=PLY",
    {
      json: true
    },
    (err, res, mainBody) => {
      if (err) {
        return console.log(err);
      }
      for (var t = 0; t < mainBody.departures.all.length; t++) {
        console.log(mainBody.departures.all.length);
        request(
          mainBody.departures.all[t].service_timetable.id,
          {
            json: true
          },
          (err, res, body) => {
            if (err) {
              return console.log(err);
            }

            var traintimearray = {};
            for (var i = 0; i < body.stops.length; i++) {
              //console.log(body.stops[i].expected_arrival_time);

              var station = body.stops[i].station_name;
              var expdept = body.stops[i].expected_departure_time;
              var livedept = body.stops[i].aimed_departure_time;
              var exparr = body.stops[i].expected_arrival_time;
              var livearr = body.stops[i].aimed_arrival_time;
              var status = body.stops[i].status;
              var plat = body.stops[i].platform;
              var stationCode = body.stops[i].station_code;

              traintimearray[i] = {
                stations: {
                  station: station,
                  stationCode: stationCode,
                  times: {
                    exp_dep: expdept,
                    live_dep: livedept,
                    exp_arriv: exparr,
                    live_arriv: livearr
                  }
                },
                status: status,
                platform: plat
              };
              //console.log(traintimearray[i].stations);
            }

            MongoClient.connect(
              url,
              function(err, db) {
                if (err) throw err;
                var dbo = db.db("traintrackar");
                var trainUIDCol = dbo.collection("TrainUID");

                trainUIDCol.find({}).toArray(function(err, result) {
                  if (err) throw err;

                  for (var i = 0; i < result.length; i++) {
                    console.log(result[i].UID);
                    dbo.collection(result[i].UID).drop(function(err, delOK) {
                      if (err) throw err;
                      if (delOK) console.log("train collection deleted");
                    });
                  }

                  var trainUIDObj = {
                    UID: body.train_uid
                  };
                  trainUIDCol.replaceOne({ }, trainUIDObj, {upsert: true}, (err, res) => {
                    if (err) throw err;
                    console.log("TrainUID data replaced");
                  });

                  dbo
                    .collection(body.train_uid)
                    .insertOne(traintimearray, (err, res) => {
                      //add document to collection using the passed in collection name
                      if (err) throw err;
                      console.log(body.train_uid + "train collection updated");
                      db.close;
                    });

                  //console.log(result);
                });
              }
            );
          }
        );
      }
    }
  );
}
//updateTrainData();
//setInterval(updateTrainData, 600000);
