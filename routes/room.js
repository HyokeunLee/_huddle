var express = require('express');
var crypto = require('crypto');
var mysql = require('mysql');
var aws = require('aws-sdk');
var multer = require('multer');
var multerS3 = require('multer-s3');
var db_config = require('../config/db_config.json');
var encryption = require('../config/enc_config.json');
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

router.get('/create/:my_id',function(req,res,next){//방 만들기시 초대할 수 있는 내 친구들 list정보를 주는 기능
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select friend_name as name,profile,pk as id from user,friend_with where user=(select id from user where pk=?) and ph=friend_ph',[req.params.my_id],function(error,rows){
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

router.post('/create',function(req,res,next){//만든 방을 저장함
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      async.series([//순차적으로 진행되어야 해서 asnyc.series사용
        function(callback) {
          connection.query('insert into meeting(host,title,text,is_open,when_fix,where_fix) values((select id from user where pk=?),?,?,?,?,?)',[req.body.meeting.host_id,req.body.meeting.title,req.body.meeting.text,req.body.meeting.is_open,req.body.meeting.when_fix,req.body.meeting.where_fix],function(error,rows){
              //방을 생성함
            if(error){
              console.log("Connection Error" + error);
              res.status(500).send({result:'FAIL'});
            }
          });
          callback(null);
        },
        function(callback) {
          if(req.body.position.place == '' || req.body.position.place == "0" ){
            req.body.position.place = null;
          }
          if(req.body.position.longitude == '' || req.body.position.longitude =='0'){
            req.body.position.longitude = null;
          }
          if(req.body.position.latitude == '' || req.body.position.latitude == '0'){
            req.body.position.latitude = null;
          }//장소가 없을시 null처리
          connection.query('insert into my_meeting(participant,meeting,place,longitude,latitude) values((select id from user where pk=?),(select max(meeting_id) from meeting where host=(select id from user where pk=?)),?,?,?)',[req.body.meeting.host_id,req.body.meeting.host_id,req.body.position.place,req.body.position.longitude,req.body.position.latitude],function(error,rows){
            //host의 선택정보 저장
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
                connection.query('insert into my_meeting(participant,meeting,place,longitude,latitude) values((select id from user where pk=?),(select max(meeting_id) from meeting where host=(select id from user where pk=?)),?,?,?)',[req.body.participant[i],req.body.meeting.host_id,null,null,null],function(error,rows){
                  //참여자들의 선택정보 만듬(이떄 선택은 아직 안했으므로 저장된 정보는 모두 null)
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
          if(req.body.participant != undefined){
            repeater(0);
          }//만일 선택한 사람이 있다면 반복문 실행
       	  else{//없으면 실행하지 않음
            callback(null);
          }
        },
        function(callback) {
          function  repeater(i){
              if(i<req.body.days.length)
              {
                connection.query('insert into my_date values((select my_meeting_id from my_meeting where participant=(select id from user where pk=?) and meeting=(select max(meeting_id) from meeting where host=(select id from user where pk=?))),?)',[req.body.meeting.host_id,req.body.meeting.host_id,req.body.days[i]],function(error,rows){
                  //방장이 선택한 날자정보 저장
                  if(error){
                    console.log("Connection Error" + error);
                    res.status(500).send({result:'FAIL'});
                  }
                  repeater(i+1);
                });
              }
              if(i == req.body.days.length){
                callback(null);
              }
          }
          if(req.body.days!=undefined){
            repeater(0);
          }//선택한 날자가 있을 시 반복문 실행
          else{//없을시 실행하지 않음
            callback(null);
          }
        }
      ], function(error, results) {
        res.status(200).send({result:'SUCCESS'});
        connection.release();//모든 query문이 실행 되었을 시 sucess전송
      });
    }
  });
});

router.get('/detail/:my_id/:meeting_id',function(req,res,next){//방의 상세정보 주는 기능
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
      connection.query('select distinct l.name,if(l.place is null and l.longitude is null and l.latitude is null and r.date is null,"0","1") as is_input,l.place,l.longitude,l.latitude from((select name,pk,my_meeting_id,place,longitude,latitude from user,my_meeting where meeting=? and participant=id) as l left join my_date as r on l.my_meeting_id=r.my_meeting)',[req.params.meeting_id],function(error,rows){
        //참여자들이 선택한 장소에 대한 정보 제공 및 입력한 상태인지 미입력한 상태인지 db에서 받아옴
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          a = rows;
        }
      });
      connection.query('select title,text,is_open,when_fix,where_fix, photo as image, name as host, profile as host_profile from user,meeting where meeting_id=? and host=id',[req.params.meeting_id],function(error,rows){
        //방의 정보를 찾아서 받아옴
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          b = rows;
        }
      });
      connection.query('select date, count(*) as count from my_meeting,my_date where meeting=? and my_meeting_id=my_meeting group by date',[req.params.meeting_id],function(error,rows){
        //선택한 방에 날자 입력 정보를 받아옴
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          c = rows;
        }
      });
      connection.query('select my_meeting_id as id from my_meeting where participant=(select id from user where pk=?) and meeting=?',[req.params.my_id,req.params.meeting_id],function(error,rows){
        //본인이 약속에 대해 선택한 정보를 접근할 수 있는 키를 받아옴
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{//모든 쿼리가 실행되었을 시 정보를 추합하여 전송
          res.status(200).send({participants: a, room_info: b, dates: c, my_meeting_id : rows[0].id});
        }
        connection.release();
      });
    }
  });
});


router.get('/vote_my_opinion/:my_meeting_id',function(req,res,next){//내가 선택했던 정보를 받아오는 기능
  pool.getConnection(function(error,connection){
    var a;
    var b;
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select friends.friend_name as name, friends.profile as profile,friends.pk as id from (select friend_name,profile,pk,friend_ph from user, friend_with where friend_ph=ph and user=(select participant from my_meeting where my_meeting_id=?)) as friends where friends.friend_ph not in (select u1.ph from my_meeting as M1, user as u1 where u1.id=participant and M1.meeting=(select meeting from my_meeting where my_meeting_id=?)) ',[req.params.my_meeting_id,req.params.my_meeting_id],function(error,rows){
        if(error){//내 친구들 중 방에 초대되지 않은 친구들의 리스트를 받아옴
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          a = rows;
        }
      });

      connection.query('select place, longitude, latitude from my_meeting where my_meeting_id=?',[req.params.my_meeting_id],function(error,rows){
        //내가 선택한 장소에 대한 정보를 받아옴
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          b = rows[0];
        }
      });
      connection.query('select date as days from my_date where my_meeting=?',[req.params.my_meeting_id],function(error,rows){
        //내가 선택한 날자의 정보를 받아옴
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

router.put('/vote_my_opinion',function(req,res,next){//변경된 내 의견을 update함
  pool.getConnection(function(error,connection){
    var a;
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      if(req.body.position.place == '' || req.body.position.place == "0" ){
        req.body.position.place = null;
      }
      if(req.body.position.longitude == '' || req.body.position.longitude == '0'){
        req.body.position.longitude = null;
      }
      if(req.body.position.latitude == '' || req.body.position.latitude == '0'){
        req.body.position.latitude = null;
      }//장소의 null값 처리
      function  repeater(i){
          if(i<req.body.participant.length)
          {
            connection.query('insert into my_meeting(participant,meeting,place,longitude,latitude) values((select id from user where pk=?),(select search.meeting from my_meeting as search where search.my_meeting_id=?),?,?,?)',[req.body.participant[i],req.body.my_meeting_id,null,null,null],function(error,rows){
              if(error){
                console.log("Connection Error" + error);
                res.status(500).send({result:'FAIL'});
              }

              repeater(i+1);
            });//추가한 친구들의 정보를 db에 저장하는 query
          }
      }
      if(req.body.participant != undefined){
	       repeater(0);
      }

      connection.query('update my_meeting set place=?,longitude=?,latitude=? where my_meeting_id=?',[req.body.position.place,req.body.position.longitude,req.body.position.latitude,req.body.my_meeting_id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
      });//내 장소정보 수정

      async.series([//날짜정보 수정
        function(callback) {
          connection.query('delete from my_date where my_meeting=?',[req.body.my_meeting_id],function(error,rows){
            //기존의 날짜 정보를 삭제 후
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
                  //새로운 날짜 정보 저장
                  if(error){
                    console.log("Connection Error" + error);
                    res.status(500).send({result:'FAIL'});
                  }

                  repeater(i+1);
                });
              }
              if(i == req.body.days.length){
                  callback(null);
              }
          }
          if(req.body.days == undefined){
      		    callback(null);
      	  }
      	  else{
          	repeater(0);
	        }
        }
      ]);

      res.status(200).send({result:'SUCCESS'});
      connection.release();
    }
  });
});


router.put('/profile_edit',upload.single('image'),function(req,res,next){// 방 사진 정보 변경
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


router.delete('/exit/:my_meeting_id',function(req,res,next){//방 나가기 기능
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select count(*) as count,i.meeting as meeting from my_meeting as i,my_meeting as c where i.meeting=c.meeting and i.my_meeting_id=? group by i.meeting',[req.params.my_meeting_id],function(error,c){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          var is_success=0;
          async.series([
            function(callback)
            {
              connection.query('delete from my_meeting where my_meeting_id=?',[req.params.my_meeting_id],function(error,rows){
                if(error){
                  console.log("connection error"+error);
                  res.status(500).send({result:'FAIL'});
                }//방을 나가기를 진행 후
                else{
                  is_success=1;
                  c[0].count = c[0].count-1;
                  callback(null);
                }
              });
            },
              function(callback)
              {
                if(c[0].count==0)//그 방에 사람이 없으면
                {
                  connection.query('delete from meeting where meeting_id=?',[c[0].meeting],function(error,rows){
                    //해당 방을 삭제
                    if(error){
                      console.log("connection error"+error);
                      res.status(500).send({result:'FAIL'});
                    }
                });
              }
              callback(null);
            },
            function(callback){
              if(is_success==1)
              {
                res.status(200).send({result:'SUCCESS'});
              }
              connection.release();
            }
          ]);
        }
      });
    }
  });
});



module.exports = router;
