const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const { program } = require('commander');

// init start url
program.requiredOption('-u, --url <string>', 'start url');
program.option('-ua, --user-agent <string>', 'user agennt');
program.parse(process.argv);
const URL = program.url;
const URL_RELATIVE = program.url.replace(/^(?:\/\/|[^/]+)*\//, '/');

const processPage = async (page, url, response) => {
  // log all urls
  fs.appendFile('urls/urls.txt', `${url}\r\n`, (err) => {
    if (err) {
      throw err;
    }
  });

  // log url by code
  fs.appendFile(
    `urls/${response.status()}.txt`,
    `${url} [code=${response.status()}]\r\n`,
    (err) => {
      if (err) {
        throw err;
      }
    }
  );

  // screenshot errors
  if (response.status() === 500) {
    const filename = url
      .replace(/^(?:\/\/|[^/]+)*\//, '')
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    await page.screenshot({
      path: `errors/${filename}.png`,
      fullPage: true,
    });
  }
};

const cleanDatas = async () => {
  await fs.readdir('errors', (error, files) => {
    if (error) throw error;
    files
      .filter((name) => /.*\.png$/.test(name))
      .forEach(async (value) => {
        await fs.unlinkSync(`errors/${value}`);
      });
  });
  await fs.readdir('urls', (error, files) => {
    if (error) throw error;
    files
      .filter((name) => /.*\.txt$/.test(name))
      .forEach(async (value) => {
        await fs.unlinkSync(`urls/${value}`);
      });
  });
};

(async () => {
  await cleanDatas();
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 2,
    skipDuplicateUrls: true,
    monitor: true,
  });
  await cluster.task(async ({ page, data: url }) => {
    if (program.userAgent) {
      await page.setUserAgent(program.userAgent);
    }
    const response = await page.goto(url);
    await page.waitFor('body');
    await processPage(page, url, response);
    const urlList = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a:not([href*="javascript"]'), (a) => a.href);
    });
    urlList.forEach((currentUrl) => {
      if (currentUrl.startsWith(URL) || currentUrl.startsWith(URL_RELATIVE)) {
        cluster.queue(currentUrl);
      }
    });
  });
  await cluster.queue(URL);
  await cluster.idle();
  await cluster.close();
})();
