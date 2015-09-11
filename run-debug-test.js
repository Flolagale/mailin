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

var mk1 = '{"id":"d662a2fc-6b69-4ccf-a4a4-5cd2bb02b172","remoteAddress":"::ffff:209.85.223.178","clientHostname":"[::ffff:209.85.223.178]","hostNameAppearsAs":"mail-io0-f178.google.com","envelope":{"mailFrom":{"address":"matkle414@gmail.com","args":false},"rcptTo":[{"address":"mirror@mail.humanexploit.com","args":false}]},"user":false,"transaction":1}';

var connection = JSON.parse(mk1);

connection.mailPath = './test/fixtures/case2-mk.eml';
//connection.mailPath = './test/fixtures/case1-tstone.eml';

delete connection.mailWriteStream;

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
