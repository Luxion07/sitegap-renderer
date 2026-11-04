import { ArgumentsHost } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import { GrpcExceptionFilter } from './grpc-exception.filter';
import { InvalidUrlError } from '../../safety/errors/invalid-url.error';
import { BlockedUrlError } from '../../safety/errors/blocked-url.error';
import { RenderTimeoutError } from '../errors/render-timeout.error';
import { SlotsBusyError } from '../errors/slots-busy.error';
import { BrowserUnavailableError } from '../../browser/errors/browser-unavailable.error';

describe('GrpcExceptionFilter', () => {
  let filter: GrpcExceptionFilter;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new GrpcExceptionFilter();
    mockHost = {} as ArgumentsHost;
  });

  async function catchError(exception: Error): Promise<{
    code: number;
    message: string;
  }> {
    const observable = filter.catch(exception, mockHost);
    try {
      await firstValueFrom(observable);
      throw new Error('Expected observable to throw');
    } catch (err: unknown) {
      if (err instanceof RpcException) {
        return err.getError() as { code: number; message: string };
      }
      throw err;
    }
  }

  it('maps InvalidUrlError to INVALID_ARGUMENT', async () => {
    const result = await catchError(new InvalidUrlError());
    expect(result.code).toBe(status.INVALID_ARGUMENT);
    expect(result.message).toBe('Please enter a valid website URL.');
  });

  it('maps BlockedUrlError to PERMISSION_DENIED', async () => {
    const result = await catchError(new BlockedUrlError());
    expect(result.code).toBe(status.PERMISSION_DENIED);
    expect(result.message).toBe(
      'This URL cannot be analyzed for security reasons.',
    );
  });

  it('maps RenderTimeoutError to DEADLINE_EXCEEDED', async () => {
    const result = await catchError(new RenderTimeoutError());
    expect(result.code).toBe(status.DEADLINE_EXCEEDED);
    expect(result.message).toBe('Render timed out');
  });

  it('maps SlotsBusyError to RESOURCE_EXHAUSTED', async () => {
    const result = await catchError(new SlotsBusyError());
    expect(result.code).toBe(status.RESOURCE_EXHAUSTED);
    expect(result.message).toBe('All render slots are currently busy');
  });

  it('maps BrowserUnavailableError to UNAVAILABLE', async () => {
    const result = await catchError(new BrowserUnavailableError());
    expect(result.code).toBe(status.UNAVAILABLE);
    expect(result.message).toBe('Browser is currently unavailable');
  });

  it('passes through existing RpcException directly', async () => {
    const rpcEx = new RpcException({
      code: status.ALREADY_EXISTS,
      message: 'Custom Rpc error',
    });
    const result = await catchError(rpcEx);
    expect(result.code).toBe(status.ALREADY_EXISTS);
    expect(result.message).toBe('Custom Rpc error');
  });

  it('maps unknown errors to INTERNAL with a safe message', async () => {
    const unknownError = new Error('Database password leak: secret123');
    const result = await catchError(unknownError);
    expect(result.code).toBe(status.INTERNAL);
    expect(result.message).toBe('An internal error occurred');
    expect(result.message).not.toContain('secret123');
  });
});
