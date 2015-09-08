'use strict';

var Mailin        = require('./lib/mailin');

//create our mailin instance
var mailin = new Mailin({
    verbose: true,
    debug: true,
    disableWebhook: true,
    disableDNSValidation: false,
    disableDnsLookup: false,
    keepTmpFile: true
});


var connection = JSON.parse(mk1);

connection.mailPath = './test/fixtures/case2';
//connection.mailPath = './test/fixtures/case1';

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
