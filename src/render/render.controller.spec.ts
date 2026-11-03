import { Test, TestingModule } from '@nestjs/testing';
import { ServerUnaryCall } from '@grpc/grpc-js';
import { RenderController } from './render.controller';
import { RenderService } from './render.service';
import { RenderDto } from './dto/render.dto';
import {
  RenderRequest,
  RenderResponse,
} from '../proto/sitegap/renderer/v1/renderer';

describe('RenderController', () => {
  let controller: RenderController;
  let mockRenderService: { render: jest.Mock };

  beforeEach(async () => {
    mockRenderService = {
      render: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RenderController],
      providers: [
        {
          provide: RenderService,
          useValue: mockRenderService,
        },
      ],
    }).compile();

    controller = module.get<RenderController>(RenderController);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to renderService without deadline if call has no deadline', async () => {
    mockRenderService.render.mockResolvedValue({
      text: 'Extracted text',
      finalUrl: 'https://example.com/done',
    });

    const dto: RenderDto = { url: 'https://example.com' };
    const response = await controller.render(dto);

    expect(mockRenderService.render).toHaveBeenCalledWith(
      'https://example.com',
      undefined,
    );
    expect(response).toEqual({
      text: 'Extracted text',
      finalUrl: 'https://example.com/done',
    });
  });

  it('computes remaining deadline from Date object in call', async () => {
    mockRenderService.render.mockResolvedValue({
      text: 'Some text',
      finalUrl: 'https://example.com',
    });

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const call = {
      getDeadline: () => new Date(now + 5000),
    } as unknown as ServerUnaryCall<RenderRequest, RenderResponse>;

    const dto: RenderDto = { url: 'https://example.com' };
    await controller.render(dto, undefined, call);

    expect(mockRenderService.render).toHaveBeenCalledWith(
      'https://example.com',
      5000,
    );
  });

  it('computes remaining deadline from numeric timestamp in call', async () => {
    mockRenderService.render.mockResolvedValue({
      text: 'Some text',
      finalUrl: 'https://example.com',
    });

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const call = {
      getDeadline: () => now + 8000,
    } as unknown as ServerUnaryCall<RenderRequest, RenderResponse>;

    const dto: RenderDto = { url: 'https://example.com' };
    await controller.render(dto, undefined, call);

    expect(mockRenderService.render).toHaveBeenCalledWith(
      'https://example.com',
      8000,
    );
  });
});
