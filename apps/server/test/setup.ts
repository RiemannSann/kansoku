import 'reflect-metadata';

// 测试不读本机的 ~/.config/kansoku/kansoku.env
process.env.KANSOKU_ENV_FILE ??= '/nonexistent/kansoku.env';
