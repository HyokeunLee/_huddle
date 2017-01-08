var express = require('express');
var crypto = require('crypto');
var mysql = require('mysql');
var aws = require('aws-sdk');
var multer = require('multer');
var multerS3 = require('multer-s3');
var db_config = require('../config/db_config.json');
var encryption = require('../config/enc_config.json');
var router = express.Router();
var async = require('async');

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
router.post('/',function(req,res,next){//로그인시 주었던 토큰에 해당하는 아이디의 메인페이지 정보를 줌
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else{
      connection.query('select meeting_id,name as host_name, profile as host_profile,title,is_open,when_fix,where_fix, count(*) as member from user,my_meeting as I,my_meeting as count,meeting where I.meeting=meeting_id and host=id and I.participant=(select id from user where pk=?) and meeting_id=count.meeting group by meeting_id',[req.body.id],function(error,rows){
          //약속방의 key값과 호스트의 이름,프로필,제목,방의 설정정보,참여자수를 보내줌
        if(error){
          console.log("connection error"+error);
          res.sendStatus(500);
        }
        else{
            res.status(200).send({result: rows});
        }
        connection.release();
      });
    }
  });
});

router.put('/edit',upload.single('image'),function(req,res,next){//개인정보 수정 기능
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else {
      var a;
      var cipher = crypto.createCipher('aes192', encryption.key);//양방향 암호화 가능한 변수 생성
      cipher.update(req.body.ph, 'utf8', 'base64');//변화된 번호 암호화
      a = cipher.final('base64');//변수 a에 암호화한 번호 저장
      if(req.file){
        sql = 'update user set name=?,ph=?,home=?,work=?,profile=? where pk=?';
        inserts = [req.body.name,a,req.body.home,req.body.work,req.file.location,req.body.id];
        //사진이 함께 변경시 사진을 s3에 등록하고 등록한 사진의 url을 profile에 넣어줌
      }
      else{
        sql = 'update user set name=?,ph=?,home=?,work=? where pk=?';
        inserts = [req.body.name,a,req.body.home,req.body.work,req.body.id];
          //사진 업로드 없을 시 사진을 제외하고 update
      }
      async.series([//업데이트 이후에 변경 정보를 줘야 하므로 async모듈 중 series 사용
        function(callback) {
          connection.query(sql,inserts,function(error,rows){//저장하는 쿼리 실행
            //새로 변경된 정보를 검색
            if(error){
              console.log("Connection Error" + error);
              res.status(500).send({result:'FAIL'});
            }
          });
          callback(null);
        },
        function(callback) {
          connection.query('select pk as id,ph,name,profile,home,work from user where pk=?',[req.body.id],function(error,rows){
            if(error){
              console.log("Connection Error" + error);
              res.status(500).send({result:'FAIL'});
            }
	          else
	          {
              var decipher = crypto.createDecipher('aes192',encryption.key);//복호화 하는 변수
              decipher.update(rows[0].ph, 'base64', 'utf8');//받아온 정보의 pw를 복호화
              var b = decipher.final('utf8');//변수 b에 저장
              var info = {//클라이언트에게 주는 형식으로 변환
                id : rows[0].id,
                ph : b,
                name: rows[0].name,
                profile: rows[0].profile,
                home: rows[0].home,
                work: rows[0].work
              };
		          res.status(200).send({result: 'SUCCESS',info: info});//정보 전송
            }
          });
        callback(null);
        }
      ]);
    connection.release();
    }
  });
});

router.post('/sync',function(req,res,next){//전화번호 동기화 기능
  pool.getConnection(function(error,connection){
    if(error){
      console.log("getConnection Error"+error);
      res.sendStatus(500);
    }
    else
    {
      console.log(req.body);
      function  repeater(i){//node는 비동기화이기때문에 반복문을 사용하기위해 재귀함수를 이용함
        if(i<req.body.friends_list.length)//받아온 친구들의 길이 많큼 재귀적으로 돌림
        {
          var a;
          var cipher = crypto.createCipher('aes192', encryption.key);//비밀번호 암호화
          cipher.update(req.body.friends_list[i].ph, 'utf8', 'base64');
          a = cipher.final('base64');
          connection.query('insert ignore into friend_with values((select id from user where pk=?),?,?)',[req.body.id, a,req.body.friends_list[i].name],function(error,rows){
            //같은 정보가 있을 시 무시하고 아닐 시 저장
            if(error){
              console.log("connection error"+error);
              res.status(500).send({result:'FAIL'});
            }
            repeater(i+1);
          });
        }
        if(i == req.body.friends_list.length)//반복문이 끝났을 시
        {
          res.status(200).send({result:'SUCCESS'});//success보냄
          connection.release();
        }
      }
      repeater(0);
    }
  });
});
module.exports = router;
