// logger.js
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        // Uncomment the following line to enable file logging
        // new winston.transports.File({ filename: 'app.log' }),
    ],
    exitOnError: false,
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
            ),
        })
    );
}

export default logger;
