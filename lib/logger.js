'use strict';

var winston = require('winston');

/* By default, only log to the console. To log to a file as well, a log file
 * path should be added explicitly. The logger object exposes the log, info,
 * warn and error methods. */
var logger = new(winston.Logger)({
    transports: [
        new(winston.transports.Console)({
            colorize: true,
            prettyPrint: true
        })
    ]
});

logger.setLogFile = function (logFilePath) {
    this.add(winston.transports.File, {
        filename: logFilePath,
        json: false,
        maxsize: 20000000,
        timestamp: true
    });
};

/* Parameter level is one of 'silly', 'verbose', 'debug', 'info', 'warn',
 * 'error'. */
logger.setLevel = function (level) {
    if (['silly', 'verbose', 'debug', 'info', 'warn', 'error'].indexOf(level) === -1) {
        logger.error('Unable to set logging level to unknown level "' + level + '".');
    } else {
        logger.transports.console.level = level;
    }
};

module.exports = logger;
