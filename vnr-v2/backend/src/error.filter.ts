import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

/** The web client expects every failure as `{ error: string }` in Vietnamese. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Đã xảy ra lỗi. Vui lòng thử lại.';
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      error = typeof body === 'string' ? body : String((body as { message?: unknown }).message ?? error);
    }
    res.status(status).set('Cache-Control', 'no-store').json({ error });
  }
}
