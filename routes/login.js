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

router.post('/',function(req,res,next){
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select id,ph,name,profile,home,work from user where id=? and pw=?',[req.body.id,req.body.pw],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.sendStatus(500);
        }
        else{
          if(rows.length>0)
          {
            res.status(201).send({result:'SUCCESS', info:rows[0]});
          }
          else{
            res.status(200).send({result: 'FAIL',  info:''});
          }
          connection.release();
        }
      });
    }
  });
});

module.exports = router;
