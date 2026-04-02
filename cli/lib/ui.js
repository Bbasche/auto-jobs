import chalk from 'chalk';
import ora from 'ora';

function createFallbackSpinner(initialText) {
  return {
    text: initialText,
    start(text = initialText) {
      this.text = text;
      console.log(chalk.cyan(`[ ... ] ${text}`));
      return this;
    },
    succeed(text = this.text) {
      console.log(chalk.green(`[ ok ] ${text}`));
      return this;
    },
    fail(text = this.text) {
      console.error(chalk.red(`[ x ] ${text}`));
      return this;
    },
    info(text = this.text) {
      console.log(chalk.cyan(`[ i ] ${text}`));
      return this;
    },
    warn(text = this.text) {
      console.log(chalk.yellow(`[ ! ] ${text}`));
      return this;
    },
    stop() {
      return this;
    },
  };
}

export function startSpinner(text) {
  if (!process.stdout.isTTY) {
    return createFallbackSpinner(text).start();
  }

  return ora(text).start();
}

export function printBanner(title, description) {
  console.log(chalk.bold(title));

  if (description) {
    console.log(description);
  }
}

export function printInfo(message) {
  console.log(chalk.cyan(message));
}

export function printSuccess(message) {
  console.log(chalk.green(message));
}

export function printWarning(message) {
  console.log(chalk.yellow(message));
}

export function printError(message) {
  console.error(chalk.red(message));
}
