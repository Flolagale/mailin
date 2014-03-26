'use strict';

var express = require('express');
// var util = require('util');
var fs = require('fs');

/* Make an http server to receive the webhook. */
var server = express();
server.use(express.bodyParser({
    limit: '100mb'
}));
server.use(server.router);

server.head('/webhook', function (req, res) {
    res.send(200);
});

server.post('/webhook', function (req, res) {
    console.log('Receiving webhook.');

    /* Respond early to avoid timouting the mailin server. */
    res.send(200);

    // console.log(util.inspect(req.body, {
    // depth: 5
    // }));

    /* Write down the payload for ulterior inspection. */
    fs.writeFileSync('payload.json', JSON.stringify(req.body));
    var msg = req.body.mailinMsg;
    if (msg.attachments) {
        msg.attachments.forEach(function (attachment) {
            var buffer = new Buffer(attachment.content, 'base64');
            fs.writeFileSync(attachment.name, buffer);
        });
    }

    console.log('Webhook payload written.');
});

server.listen(3000, function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Http server listening on port 3000');
    }
});
