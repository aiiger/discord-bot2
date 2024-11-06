// logger.js

import winston from 'winston';

// Define the log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
        (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
    )
);

// Create the logger instance
const logger = winston.createLogger({
    level: 'info', // Set the minimum log level
    format: logFormat,
    transports: [
        new winston.transports.Console(),
        // Uncomment the following line to enable file logging
        // new winston.transports.File({ filename: 'app.log' }),
    ],
    exitOnError: false, // Do not exit on handled exceptions
});

// If not in production, also log to the `debug` level with colorized output
if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            ),
        })
    );
}

export default logger;
