'use strict';

var app, async, cluster, cpuCount, express, fs, http, i, multiparty, port, server, util;

express = require('express');
cluster = require('cluster');
http = require('http');
async = require('async');
fs = require('fs');
multiparty = require('multiparty');
util = require('util');

/* Start cluster to take advantage of multi-core servers */
if (cluster.isMaster) {
  cpuCount = require('os').cpus().length;
  i = 0;
  while (i < cpuCount) {
    cluster.fork();
    i += 1;
  }
} else {
  /* Make an http server to receive the webhook. */
  app = express();
  port = 3000;
  server = app.listen(port);
  app.head('/webhook', function(req, res) {
    console.log('Received head request from webhook.');
    res.sendStatus(200);
  });
  app.post('/webhook', function(req, res) {
    var form;
    console.log('Receiving webhook.');

    /* Respond early to avoid timouting the mailin server. */
    /* Parse the multipart form. The attachments are parsed into fields and can
     * be huge, so set the maxFieldsSize accordingly.
     */
    form = new multiparty.Form({
      maxFieldsSize: 70000000
    });
    form.on('progress', (function() {
      var lastDisplayedPercentage, start;
      start = Date.now();
      lastDisplayedPercentage = -1;
      return function(bytesReceived, bytesExpected) {
        var elapsed, percentage;
        elapsed = Date.now() - start;
        percentage = Math.floor(bytesReceived / bytesExpected * 100);
        if (percentage % 20 === 0 && percentage !== lastDisplayedPercentage) {
          lastDisplayedPercentage = percentage;
          console.log('Form upload progress ' + percentage + '% of ' + bytesExpected / 1000000 + 'Mb. ' + elapsed + 'ms');
        }
      };
    })());
    form.parse(req, function(err, fields) {
      console.log(util.inspect(fields.mailinMsg, {
        depth: 5
      }));
      console.log('Parsed fields: ' + Object.keys(fields));

      /* Write down the payload for ulterior inspection. */
      async.auto({
        writeParsedMessage: function(cbAuto) {
          fs.writeFile('payload.json', fields.mailinMsg, cbAuto);
        },
        writeAttachments: function(cbAuto) {
          var msg;
          msg = JSON.parse(fields.mailinMsg);
          async.eachLimit(msg.attachments, 3, (function(attachment, cbEach) {
            fs.writeFile(attachment.generatedFileName, fields[attachment.generatedFileName], 'base64', cbEach);
          }), cbAuto);
        }
      }, function(err) {
        if (err) {
          console.log(err.stack);
          res.status(500).send(err, "Unable to write payload");
        } else {
          console.log('Webhook payload written.');
          res.sendStatus(200);
        }
      });
    });
  });
  http.createServer(app).listen(app.get(port), function() {
    var cpuNum;
    cpuNum = parseInt(cluster.worker.id) - 1;
    cpuNum = cpuNum.toString();
    console.log('Express server listening on port ' + port + ', cpu:worker:' + cpuNum);
  });
}

/* Catch dying cluster threads and respawn them */
cluster.on('exit', function(worker) {
  var cpuNum;
  cpuNum = parseInt(worker.id) - 1;
  cpuNum = cpuNum.toString();
  console.log('cpu:worker:' + cpuNum + ' died unexpectedly, respawning...');
  cluster.fork();
});
