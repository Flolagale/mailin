'use strict';

var Mailin        = require('./lib/mailin');

//create our mailin instance
var mailin = new Mailin({
    verbose: true,
    debug: true,
    disableWebhook: true,
    keepTmpFile: true
});

var tstone1 = '{"from":"tstone@controlscan.com","to":["mirror@mail.humanexploit.com"],"date":"2015-09-04T18:12:26.165Z","remoteAddress":"::ffff:199.193.204.204","authentication":{"username":false,"authenticated":false,"state":"NORMAL"},"host":"out.West.EXCH082.serverdata.net","mailPath":".tmp/fb66f544876d38ac1d419d0a16828a6e7e96fe9b","mailWriteStream":{"_writableState":{"objectMode":false,"highWaterMark":16384,"needDrain":false,"ending":false,"ended":false,"finished":false,"decodeStrings":true,"defaultEncoding":"utf8","length":0,"writing":false,"corked":0,"sync":true,"bufferProcessing":false,"writecb":null,"writelen":0,"bufferedRequest":null,"lastBufferedRequest":null,"pendingcb":0,"prefinished":false,"errorEmitted":false},"writable":true,"domain":null,"_events":{},"_maxListeners":20,"path":".tmp/fb66f544876d38ac1d419d0a16828a6e7e96fe9b","fd":null,"flags":"w","mode":438,"bytesWritten":0},"id":"41996b0d","level":"debug","message":"replied","timestamp":"2015-09-04T18:12:26.618Z"}';

var connection = JSON.parse(tstone1);

connection.mailPath = connection.mailWriteStream.path = './test/fixtures/case1-tstone.eml';

console.log(connection);

mailin.start(function(){
  mailin.onDataReady(connection, function(results){
    delete results.rawEmail;

    //console.log(results);
  });
});


mailin.on('message', function(connection, report, raw){
  console.log('message event called');
});
