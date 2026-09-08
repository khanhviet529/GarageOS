import { Module } from '@nestjs/common';
import { ArticleService } from './article.service';
import { ArticleController } from './article.controller';
import { NavigationController } from './navigation.controller';
import { LeadFormController } from './lead-form.controller';
import { UserAdminController } from './user-admin.controller';

@Module({ providers: [ArticleService], controllers: [ArticleController, NavigationController, LeadFormController, UserAdminController], exports: [ArticleService] })
export class ArticleModule {}
