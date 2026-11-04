import {
  ArgumentsHost,
  Catch,
  Logger,
  RpcExceptionFilter,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Observable, throwError } from 'rxjs';
import { InvalidUrlError } from '../../safety/errors/invalid-url.error';
import { BlockedUrlError } from '../../safety/errors/blocked-url.error';
import { RenderTimeoutError } from '../errors/render-timeout.error';
import { SlotsBusyError } from '../errors/slots-busy.error';
import { BrowserUnavailableError } from '../../browser/errors/browser-unavailable.error';

interface SendableRpcError extends RpcException {
  code?: number;
  details?: string;
}

function toRpcException(code: status, message: string): RpcException {
  const exception = new RpcException({ code, message }) as SendableRpcError;
  exception.code = code;
  exception.details = message;
  return exception;
}

@Catch()
export class GrpcExceptionFilter implements RpcExceptionFilter<Error> {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  catch(exception: Error, _host: ArgumentsHost): Observable<never> {
    if (exception instanceof RpcException) {
      const error: unknown = exception.getError();
      if (typeof error === 'object' && error !== null) {
        const errorObj = error as { code?: unknown; message?: unknown };
        const sendable = exception as SendableRpcError;
        if (typeof errorObj.code === 'number') {
          sendable.code = errorObj.code;
        }
        if (typeof errorObj.message === 'string') {
          sendable.details = errorObj.message;
        }
      }
      return throwError(() => exception);
    }

    if (exception instanceof InvalidUrlError) {
      return throwError(() =>
        toRpcException(
          status.INVALID_ARGUMENT,
          exception.message || 'Please enter a valid website URL.',
        ),
      );
    }

    if (exception instanceof BlockedUrlError) {
      return throwError(() =>
        toRpcException(
          status.PERMISSION_DENIED,
          exception.message ||
            'This URL cannot be analyzed for security reasons.',
        ),
      );
    }

    if (exception instanceof RenderTimeoutError) {
      return throwError(() =>
        toRpcException(status.DEADLINE_EXCEEDED, 'Render timed out'),
      );
    }

    if (exception instanceof SlotsBusyError) {
      return throwError(() =>
        toRpcException(
          status.RESOURCE_EXHAUSTED,
          'All render slots are currently busy',
        ),
      );
    }

    if (exception instanceof BrowserUnavailableError) {
      return throwError(() =>
        toRpcException(status.UNAVAILABLE, 'Browser is currently unavailable'),
      );
    }

    this.logger.error(
      `Unhandled error during RPC: ${exception.message}`,
      exception.stack,
    );

    return throwError(() =>
      toRpcException(status.INTERNAL, 'An internal error occurred'),
    );
  }
}
