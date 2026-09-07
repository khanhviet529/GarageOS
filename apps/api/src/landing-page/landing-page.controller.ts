import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { LandingPageDraftInput, LandingPublishInput, type ActorContext } from '@garageos/contracts';
import { Actor } from '../common/actor.decorator';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';
import { JwtGuard } from '../auth/jwt.guard';
import { LandingPageService } from './landing-page.service';

@Controller('api/v1/marketing/landing-pages')
@UseGuards(JwtGuard)
export class LandingPageController {
  constructor(@Inject(LandingPageService) private readonly service: LandingPageService) {}

  @Get()
  list(@Actor() actor: ActorContext) { assertCan(actor, 'marketing:landingRead'); return this.service.list(actor); }

  @Post()
  createHome(@Actor() actor: ActorContext) { assertCan(actor, 'marketing:landingWrite'); return this.service.createHome(actor); }

  @Get(':id')
  get(@Actor() actor: ActorContext, @Param('id') id: string) { assertCan(actor, 'marketing:landingRead'); return this.service.get(actor, id); }

  @Post(':id/draft')
  cloneDraft(@Actor() actor: ActorContext, @Param('id') id: string) { assertCan(actor, 'marketing:landingWrite'); return this.service.cloneDraft(actor, id); }

  @Patch(':id/draft')
  patchDraft(@Actor() actor: ActorContext, @Param('id') id: string, @Body(new ZodPipe(LandingPageDraftInput)) input: LandingPageDraftInput) {
    assertCan(actor, 'marketing:landingWrite'); return this.service.patchDraft(actor, id, input);
  }

  @Get(':id/revisions')
  revisions(@Actor() actor: ActorContext, @Param('id') id: string) { assertCan(actor, 'marketing:landingRead'); return this.service.revisions(actor, id); }

  @Post(':id/publish')
  publish(@Actor() actor: ActorContext, @Param('id') id: string, @Body(new ZodPipe(LandingPublishInput)) input: { version: number }) {
    assertCan(actor, 'marketing:landingPublish'); return this.service.publish(actor, id, input.version);
  }

  @Post(':id/rollback')
  rollback(@Actor() actor: ActorContext, @Param('id') id: string) { assertCan(actor, 'marketing:landingPublish'); return this.service.rollback(actor, id); }

  @Post(':id/preview-sessions')
  preview(@Actor() actor: ActorContext, @Param('id') id: string) { assertCan(actor, 'marketing:landingRead'); return this.service.createPreview(actor, id); }
}
