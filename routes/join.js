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


router.get('/:id',function(req,res,next){
  pool.getConnection(function(error, connection){
    if (error){
      console.log("getConnection Error" + error);
      res.sendStatus(500);
    }
    else{
      connection.query('select id from user where id = ?',[req.params.id],function(error,rows){
        if (error){
          console.log("Connection Error" + error);
          res.sendStatus(500);
        }
        else{
          if(rows.length > 0){
            res.status(200).send({result:'FAIL'});
          }
          else{
            res.status(200).send({result:'SUCCESS'});
          }
          connection.release();
        }
      });
    }
  });
});


router.post('/',upload.single('image'),function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      if(req.file){
        sql = 'insert into user(id, ph, pw, name, work, home, profile) values(?,?,?,?,?,?,?)';
        inserts = [req.body.id, req.body.ph, req.body.pw, req.body.name, req.body.work, req.body.home, req.file.location];
      }
      else{
        sql = 'insert into user(id, ph, pw, name, work, home) values(?,?,?,?,?,?)';
        inserts = [req.body.id, req.body.ph, req.body.pw, req.body.name, req.body.work, req.body.home];
      }
      connection.query(sql,inserts,function(error, rows){
        if(error){
          console.log("Connection Error" + error);
          res.status(500).send({result:'FAIL'});
        }
        else{
          res.status(200).send({result:'SUCCESS'});
        }
        connection.release();
      });
    }
  });
});

module.exports = router;
