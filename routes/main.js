var express = require('express');
var mysql = require('mysql');
var aws = require('aws-sdk');
var multer = require('multer');
var multerS3 = require('multer-s3');
var db_config = require('../config/db_config.json');
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

//여기 Get으로 바꿈 서버상에는 post로 되어있는데 안드 ios 변경 완료시 get으로 바꿔서 띄울예정
router.get('/:id',function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select meeting_id,name as host_name, profile as host_profile,title,is_open,when_fix,where_fix, count(*) as member from user,my_meeting as I,my_meeting as count,meeting where I.meeting=meeting_id and host=id and I.participant=? and meeting_id=count.meeting group by meeting_id',[req.params.id],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.sendStatus(500);
        }
        else{
          if(rows.length>0)
          {
            res.status(200).send({result: rows});
          }
          else{
            res.status(200).send({result: rows});
          }
        }
        connection.release();
      });
    }
  });
});

router.put('/edit',upload.single('image'),function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else {
      if(req.file){
        sql = 'update user set name=?,ph=?,home=?,work=?,profile=? where id=?';
        inserts = [req.body.name,req.body.ph,req.body.home,req.body.work,req.file.location,req.body.id];
      }
      else{
        sql = 'update user set name=?,ph=?,home=?,work=? where id=?';
        inserts = [req.body.name,req.body.ph,req.body.home,req.body.work,req.body.id];
      }
      connection.query(sql,inserts,function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.status(500).send({result: 'FAIL'});
        }
        else{
          console.log(req.body);
          res.status(200).send({result: 'SUCCESS'});
        }
        connection.release();
      });
    }
  });
});

router.post('/sync',function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else
    {
      console.log(req.body);
    function  repeater(i){
        if(i<req.body.friends_list.length)
        {

            connection.query('insert ignore into friend_with values(?,?,?)',[req.body.id, req.body.friends_list[i].ph,req.body.friends_list[i].name],function(error,rows){
              if(error){
                console.log("connection error"+error);
                res.status(500).send({result:'FAIL'});
            }

            repeater(i+1);
        })
      }
      if(i == req.body.friends_list.length)
      {

        res.status(200).send({result:'SUCCESS'});
            connection.release();
      }
    }
    repeater(0);

  }
  });
});
module.exports = router;
