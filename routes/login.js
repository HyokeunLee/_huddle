var express = require('express');
var crypto = require('crypto');
var mysql = require('mysql');
var aws = require('aws-sdk');
var multer = require('multer');
var multerS3 = require('multer-s3');
var db_config = require('../config/db_config.json');
var encryption = require('../config/enc_config.json');
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

router.post('/',function(req,res,next){//로그인 기능
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      var hmac = crypto.createHmac('sha256', encryption.key);//단방향 암호화
      var a= hmac.update(req.body.pw).digest('base64');//a에 단방향 암호화한 pw 저장
      connection.query('select pk as id,ph,name,profile,home,work from user where id=? and pw=?',[req.body.id,a],function(error,rows){
        if(error){
          console.log("connection error"+error);
          res.sendStatus(500);
        }
        else{
          if(rows.length>0)//정보가 있을 시
          {
            var decipher = crypto.createDecipher('aes192',encryption.key);
            decipher.update(rows[0].ph, 'base64', 'utf8');//암호화한 전화번호를 복호화
            var b = decipher.final('utf8');//b에 utf8방식으로 저장
            var info = {//복호화한 정보를 유저에게 주는 방식으로 묶어줌
              id : rows[0].id,
              ph : b,
              name: rows[0].name,
              profile: rows[0].profile,
              home: rows[0].home,
              work: rows[0].work
            };
            res.status(201).send({result:'SUCCESS', info:info});//정보를 보냄
          }
          else{
            res.status(200).send({result: 'FAIL',  info:''});// 정보가 없을 시 fail을 보내줌
          }
          connection.release();
        }
      });
    }
  });
});

module.exports = router;
