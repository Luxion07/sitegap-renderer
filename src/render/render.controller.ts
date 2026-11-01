import { Controller, UsePipes, ValidationPipe } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import {
  RenderResponse,
  RendererController as IRendererController,
} from '../proto/sitegap/renderer/v1/renderer';
import { RenderDto } from './dto/render.dto';

@Controller()
export class RenderController implements IRendererController {
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
  render(_data: RenderDto): RenderResponse {
    throw new RpcException({
      code: status.UNIMPLEMENTED,
      message: 'Render is not implemented yet',
    });
  }
}
