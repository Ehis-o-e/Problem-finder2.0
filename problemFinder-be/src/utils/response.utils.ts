import { Response } from 'express';
import { ApiResponse } from '../types';

export const sendSuccess = <T>(
    res: Response,
    data: T,
    message: string = 'Success',
    statusCode: number = 200
): Response => {
    const response: ApiResponse<T> = {
        success: true,
        data,
        message
    };
    return res.status(statusCode).json(response);
};

export const sendError = (
    res: Response,
    message: string,
    code: string = 'ERROR',
    statusCode: number = 500,
    details?: any
): Response => {
    const response: ApiResponse = {
        success: false,
        error: {
            code,
            message,
            details
        }
    };
    return res.status(statusCode).json(response);
};