<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
:root {
  /* Apple System Colors */
  --primary-color: #007AFF;
  --secondary-color: #86868B;
  --text-tertiary: #BFBFC3;
  --success-color: #34C759;
  --warning-color: #FF9500;
  --error-color: #FF3B30;
  --background-color: #F5F5F7;
  --text-color: #1D1D1F;
  --text-primary: #1D1D1F;
  --text-secondary: #86868B;
  --border-color: rgba(0, 0, 0, 0.05);
  --sidebar-bg: rgba(255, 255, 255, 0.8);
  --sidebar-text: #86868B;
  --sidebar-hover: rgba(0, 0, 0, 0.03);
  --sidebar-active: #EAEAEA;

  /* Spacing & Radius */
  --radius-l: 20px;
  --radius-m: 14px;
  --radius-s: 8px;
  --shadow-card: 0 4px 24px rgba(0, 0, 0, 0.04);
  --shadow-hover: 0 12px 40px rgba(0, 0, 0, 0.08);

  /* Font */
  --font-stack: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Inter", sans-serif;
  --bg-card: #FFFFFF;
}

html, body, #__nuxt {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  font-family: var(--font-stack);
  background-color: var(--background-color);
  color: var(--text-color);
  -webkit-font-smoothing: antialiased;
}

/* Override element-plus default theme to match Apple style */
:root {
  --el-color-primary: var(--primary-color);
  --el-color-success: var(--success-color);
  --el-color-warning: var(--warning-color);
  --el-color-danger: var(--error-color);
  --el-bg-color-page: var(--background-color);
  --el-text-color-primary: var(--text-primary);
  --el-text-color-regular: var(--text-secondary);
  --el-border-radius-base: var(--radius-s);
  --el-border-radius-small: 6px;
  --el-border-radius-round: 20px;
}
</style>
