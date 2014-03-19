'use strict';

var express = require('express');
var util = require('util');

/* Make an http server to receive the webhook. */
var server = express();
server.use(express.bodyParser());
server.use(server.router);
server.head('/webhook', function (req, res) {
    res.send(200);
});
server.post('/webhook', function (req, res) {
    console.log('Receiving webhook.');
    console.log(util.inspect(req.body, {
        depth: 5
    }));

    res.send(200);
});
server.listen(3000, function (err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Http server listening on port 3000');
    }
});
