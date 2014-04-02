#!/usr/bin/env node
'use strict';

var forever = require('forever-monitor');

var mailinProcess = new (forever.Monitor)('cli.js', {
    max: 3,
    minUptime: 10000,
    options: process.argv
});

mailinProcess.on('error', function (err) {
    console.log(err);
});

mailinProcess.on('restart', function () {
    console.log('Mailin restarted.');
});

mailinProcess.on('exit', function () {
    console.log('Mailin exited.');
});

mailinProcess.start();
