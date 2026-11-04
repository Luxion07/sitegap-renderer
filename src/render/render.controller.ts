import {
  Controller,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Metadata, ServerUnaryCall, status } from '@grpc/grpc-js';
import {
  RenderRequest,
  RenderResponse,
  RendererController as IRendererController,
} from '../proto/sitegap/renderer/v1/renderer';
import { RenderDto } from './dto/render.dto';
import { RenderService } from './render.service';
import { GrpcExceptionFilter } from './filters/grpc-exception.filter';

@Controller()
@UseFilters(GrpcExceptionFilter)
export class RenderController implements IRendererController {
  constructor(private readonly renderService: RenderService) {}

  @GrpcMethod('Renderer', 'Render')
  @UsePipes(
    new ValidationPipe({
      exceptionFactory: (errors) =>
        new RpcException({
          code: status.INVALID_ARGUMENT,
          message: errors
            .map((e) => Object.values(e.constraints ?? {}).join(', '))
            .join('; '),
        }),
    }),
  )
  async render(
    data: RenderDto,
    _metadata?: Metadata,
    call?: ServerUnaryCall<RenderRequest, RenderResponse>,
  ): Promise<RenderResponse> {
    let remainingDeadlineMs: number | undefined;
    if (call?.getDeadline) {
      const deadline = call.getDeadline();
      if (deadline instanceof Date) {
        remainingDeadlineMs = Math.max(0, deadline.getTime() - Date.now());
      } else if (typeof deadline === 'number' && Number.isFinite(deadline)) {
        remainingDeadlineMs = Math.max(0, deadline - Date.now());
      }
    }

    return await this.renderService.render(data.url, remainingDeadlineMs);
  }
}
