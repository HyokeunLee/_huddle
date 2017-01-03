var express = require('express');
var mysql = require('mysql');
var aws = require('aws-sdk');
var multer = require('multer');
var multerS3 = require('multer-s3');
var db_config = require('../config/db_config.json');
var async = require('async');
var router = express.Router();

aws.config.loadFromPath('./config/aws_config.json');

var s3 = new aws.S3();

var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'minuk',    //bucket이름
    acl: 'public-read',   //권한
    //s3에 저장될 파일 이름 : key
    key: function (req, file, cb) {
      cb(null, Date.now() + '.' + file.originalname.split('.').pop());
    }
  })
});

var pool = mysql.createPool({
  host : db_config.host,
  port : db_config.port,
  user : db_config.user,
  password : db_config.password,
  database : db_config.database,
  connectionLimit : db_config.connectionLimit
});

router.get('/create/:my_id',function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select friend_name as name,profile,id from user,friend_with where user=? and ph=friend_ph',[req.params.my_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.sendStatus(500);
        }
        else{
          res.status(200).send({friend_list: rows});
        }
        connection.release();
      });
    }
  });
});

router.post('/create',function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      async.series([
        function(callback) {
          connection.query('insert into meeting(host,title,text,is_open,when_fix,where_fix) values(?,?,?,?,?,?)',[req.body.meeting.host_id,req.body.meeting.title,req.body.meeting.text,req.body.meeting.is_open,req.body.meeting.when_fix,req.body.meeting.where_fix],function(error,rows){
            if(error){
              console.log("Connection Error" + error);
              res.status(500).send({result:'FAIL'});
            }
          });
          callback(null);
        },
        function(callback) {
          connection.query('insert into my_meeting(participant,meeting,place,longitude,latitude) values(?,(select max(meeting_id) from meeting where host=?),?,?,?)',[req.body.meeting.host_id,req.body.meeting.host_id,req.body.position.place,req.body.position.longitude,req.body.position.latitude],function(error,rows){
            if(error){
              console.log("Connection Error" + error);
              res.status(500).send({result:'FAIL'});
            }
          });
          callback(null);
        },
        function(callback) {
          function  repeater(i){
              if(i<req.body.participant.length)
              {
                connection.query('insert into my_meeting(participant,meeting,place,longitude,latitude) values(?,(select max(meeting_id) from meeting where host=?),?,?,?)',[req.body.participant[i],req.body.meeting.host_id,null,null,null],function(error,rows){
                  if(error){
                    console.log("Connection Error" + error);
                    res.status(500).send({result:'FAIL'});
                  }

                  repeater(i+1);
                });
              }
              if(i == req.body.participant.length){
                  callback(null);
              }
          }
          repeater(0);
        },
        function(callback) {
          function  repeater(i){
              if(i<req.body.days.length)
              {
                connection.query('insert into my_date values((select my_meeting_id from my_meeting where participant=? and meeting=(select max(meeting_id) from meeting where host=?)),?)',[req.body.meeting.host_id,req.body.meeting.host_id,req.body.days[i]],function(error,rows){
                  if(error){
                    console.log("Connection Error" + error);
                    res.status(500).send({result:'FAIL'});
                  }
                  repeater(i+1);
                });
              }
              if(i == req.body.participant.length){
                callback(null);
              }
          }
          repeater(0);
        }
      ], function(error, results) {
        res.status(200).send({result:'SUCCESS'});
        connection.release();
      });
    }
  });
});

router.get('/detail/:my_id/:meeting_id',function(req,res,next){
  pool.getConnection(function(error,connection){
    var a;
    var b;
    var c;
    var d;
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select name,profile,place,longitude,latitude from user,my_meeting where meeting=? and participant=id',[req.params.meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          a = rows;
        }
      });
      connection.query('select title,text,is_open,when_fix,where_fix, photo as image, name as host from user,meeting where meeting_id=? and host=id',[req.params.meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          b = rows;
        }
      });
      connection.query('select date, count(*) as count from my_meeting,my_date where meeting=? and my_meeting_id=my_meeting group by date',[req.params.meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          c = rows;
        }
      });
      connection.query('select my_meeting_id as id from my_meeting where participant=? and meeting=?',[req.params.my_id,req.params.meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          res.status(200).send({participants: a, room_info: b, dates: c, my_meeting_id : rows[0].id});
        }
        connection.release();
      });
    }
  });
});


router.get('/vote_my_opinion/:my_meeting_id',function(req,res,next){
  pool.getConnection(function(error,connection){
    var a;
    var b;
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select friends.friend_name as name, friends.profile as profile,friends.id as id from (select friend_name,profile,id,friend_ph from user, friend_with where friend_ph=ph and user=(select participant from my_meeting where my_meeting_id=?)) as friends where friends.friend_ph not in (select u1.ph from my_meeting as M1, user as u1 where u1.id=participant and M1.meeting=(select meeting from my_meeting where my_meeting_id=?)) ',[req.params.my_meeting_id,req.params.my_meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          a = rows;
        }
      });

      connection.query('select place, longitude, latitude from my_meeting where my_meeting_id=? ',[req.params.my_meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          b = rows[0];
        }
      });
      connection.query('select date as days from my_date where my_meeting=?',[req.params.my_meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          var days=[];
          for(var i in rows)
          {
              days.push(rows[i].days);
          }

          res.status(200).send({friend_list :a,days, position: b, my_meeting_id: req.params.my_meeting_id });
        }
        connection.release();
      });

    }
  });
});

//쿼리추가 필요 ->쿼리 몇개필요할지 몰라서 일단 2개정도 만들어놓음
router.put('/vote_my_opinion',function(req,res,next){
  pool.getConnection(function(error,connection){
    var a;
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      function  repeater(i){
          if(i<req.body.participant.length)
          {
            connection.query('insert into my_meeting(participant,meeting,place,longitude,latitude) values(?,(select search.meeting from my_meeting as search where search.my_meeting_id=?),?,?,?)',[req.body.participant[i],req.body.my_meeting_id,null,null,null],function(error,rows){
              if(error){
                console.log("Connection Error" + error);
                res.status(500).send({result:'FAIL'});
              }

              repeater(i+1);
            });
          }
      }
      repeater(0);

      connection.query('update my_meeting set place=?,longitude=?,latitude=? where my_meeting_id=?',[req.body.position.place,req.body.position.longitude,req.body.position.latitude,req.body.my_meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
      });

      async.series([
        function(callback) {
          connection.query('delete from my_date where my_meeting=?',[req.body.my_meeting_id],function(error,rows){
            if(error){
              console.log("Connection Error" + error);
              res.status(500).send({result:'FAIL'});
            }
          });
          callback(null);
        },
        function(callback) {
          function  repeater(i){
              if(i<req.body.days.length)
              {
                connection.query('insert into my_date(my_meeting,date) values(?,?)',[req.body.my_meeting_id,req.body.days[i]],function(error,rows){
                  if(error){
                    console.log("Connection Error" + error);
                    res.status(500).send({result:'FAIL'});
                  }

                  repeater(i+1);
                });
              }
              if(i == req.body.participant.length){
                  callback(null);
              }
          }
          repeater(0);
        }
      ]);

      res.status(200).send({result:'SUCCESS'});
      connection.release();
    }
  });
});


router.put('/profile_edit',upload.single('image'),function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else {
      if(req.file){
        sql = 'update meeting set photo=? where meeting_id=(select meeting from my_meeting where my_meeting_id=?)' ;
        inserts = [req.file.location,req.body.my_meeting_id];
      }
      else{
        sql = 'update meeting set photo=? where meeting_id=(select meeting from my_meeting where my_meeting_id=?)' ;
        inserts = [null,req.body.my_meeting_id];
      }
      connection.query(sql,inserts,function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result: 'FAIL'});
        }
        else{
          res.status(200).send({result: 'SUCCESS'});
        }
        connection.release();
      });
    }
  });
});


router.delete('/exit',function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('delete from huddle_v2.my_meeting where my_meeting_id=?',[req.body.my_meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          res.status(200).send({resut:'SUCCESS'});
        }
        connection.release();
      });
    }
  });
});


module.exports = router;
