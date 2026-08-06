import { Routes } from '@angular/router';
import { ArticlePage } from './article-page/article-page';
import { ArticleEditorPage } from './article-editor-page/article-editor-page';
import { ArticleManagementPage } from './article-management-page/article-management-page';
import { EmployeePage } from './employee-page/employee-page';
import { ResultEditorPage } from './result-editor-page/result-editor-page';
import { ResultManagementPage } from './result-management-page/result-management-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', children: [] },
  { path: 'artykul/:id', component: ArticlePage },
  { path: 'employee/article/new', component: ArticleEditorPage },
  { path: 'employee/article/:id/edit', component: ArticleEditorPage },
  { path: 'employee/articles', component: ArticleManagementPage },
  { path: 'employee/result/new', component: ResultEditorPage },
  { path: 'employee/result/:id/edit', component: ResultEditorPage },
  { path: 'employee/results', component: ResultManagementPage },
  { path: 'employee', component: EmployeePage },
  { path: '**', redirectTo: '' },
];
