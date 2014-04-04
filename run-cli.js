#!/usr/bin/env node
'use strict';

var forever = require('forever-monitor');
var logger = require('./lib/logger');
var path = require('path');

var pkg = require('./package.json');

var mailinProcess = new (forever.Monitor)(path.join(__dirname, 'cli.js'), {
    max: 100,
    minUptime: 10000,
    options: process.argv.slice(2)
});

mailinProcess.on('error', function (err) {
    logger.error('Error caused Mailin to crash.');
    logger.error('Please report this to ' + pkg.bugs.url);
    logger.error(err);
    logger.info();
    logger.info();
});

mailinProcess.on('restart', function () {
    logger.warn('It is likely that an error caused Mailin to crash.');
    logger.warn('Please report this to ' + pkg.bugs.url);
    logger.warn('Mailin restarted.');
    logger.info();
    logger.info();
});

mailinProcess.on('exit', function () {
    logger.info('Mailin stopped.');
});

mailinProcess.start();
