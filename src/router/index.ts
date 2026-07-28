import { createRouter, createWebHistory } from 'vue-router';

import DevCoverCapturePage from '@/pages/dev-cover-capture-page.vue';
import HomePage from '@/pages/home-page.vue';
import JoinPage from '@/pages/join-page.vue';
import RoomPage from '@/pages/room-page.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
    {
      path: '/join',
      name: 'join',
      component: JoinPage,
    },
    {
      path: '/room/:id',
      name: 'room',
      component: RoomPage,
    },
    {
      path: '/dev/cover-capture/:gameId/:slideIndex?',
      name: 'dev-cover-capture',
      component: DevCoverCapturePage,
    },
  ],
});
