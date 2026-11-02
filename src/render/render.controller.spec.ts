import { RenderController } from './render.controller';
import { Test, TestingModule } from '@nestjs/testing';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { RenderDto } from './dto/render.dto';

describe('RenderController', () => {
  let controller: RenderController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RenderController],
    }).compile();
    controller = module.get<RenderController>(RenderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should throw UNIMPLEMENTED RpcException on valid request for now', () => {
    const dto: RenderDto = { url: 'https://example.com' };
    expect(() => controller.render(dto)).toThrow(RpcException);
    try {
      controller.render(dto);
    } catch (error) {
      const rpcError = error as RpcException;
      const errorObj = rpcError.getError() as { code: number; message: string };
      expect(errorObj.code).toBe(status.UNIMPLEMENTED);
    }
  });
});
