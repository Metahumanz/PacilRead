<template>
  <div class="async-view-loading" role="status" aria-label="正在加载页面">
    <span class="app-progress-ring"></span>
    <p>正在加载…</p>
  </div>
</template>

<style scoped>
.async-view-loading { display:flex; min-height:260px; flex-direction:column; align-items:center; justify-content:center; gap:14px; color:var(--app-text-muted); font-size:13px; }
.async-view-loading span { width:30px; height:30px; border:3px solid currentColor; border-right-color:transparent; border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
</style>
