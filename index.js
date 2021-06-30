const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const { program } = require('commander');

// init start url
program.requiredOption('-u, --url <string>', 'start url');
program.option('-ua, --user-agent <string>', 'user agent');
program.parse(process.argv);

const options = program.opts();
const URL = options.url;
const URL_RELATIVE = options.url.replace(/^(?:\/\/|[^/]+)*\//, '/');

const writeLineToFile = (filePath, data) => {
  fs.appendFile(filePath, `${data}\r\n`, (err) => {
    if (err) {
      return console.log(err);
    }
  });
};

const deleteFilesTypesFromPath = async (path, extension) => {
  const types = new RegExp(`.*\.${extension}$`);
  await fs.readdir(path, (error, files) => {
    if (error) throw error;
    files.filter(name => types.test(name)).forEach(async (value) => {
      await fs.unlinkSync(`${path}/${value}`);
    });
  });
};

const processPage = async (page, url, response) => {

  const content = await page.content();
  const cookies = await page.cookies();
  const filename = url.replace(/^(?:\/\/|[^/]+)*\//, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();

  // console.log(cookies)

  // log all urls
  writeLineToFile('urls/urls.txt', url);

  // log url by code
  writeLineToFile(`urls/${response.status()}.txt`, `${url} [code=${response.status()}]`);

  // screenshot errors
  if (response.status() === 500) {
    await page.screenshot({
      path: `errors/${filename}.png`,
      fullPage: true
    });
    writeLineToFile('errors/urls.txt', url);
  }

  // check contain a value
  if (content.indexOf('ERROR') !== -1) {
    await page.screenshot({
      path: `extracts/${filename}.png`,
      fullPage: true
    });
    writeLineToFile('extracts/urls.txt', url);
  }
};

const cleanDatas = async () => {
  await deleteFilesTypesFromPath('errors', 'png');
  await deleteFilesTypesFromPath('errors', 'txt');
  await deleteFilesTypesFromPath('urls', 'txt');
  await deleteFilesTypesFromPath('extracts', 'png');
  await deleteFilesTypesFromPath('extracts', 'txt');
};

(async () => {
  await cleanDatas();

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 2,
    skipDuplicateUrls: true,
    monitor: true
  });

  cluster.on('taskerror', (err, data, willRetry) => {
    if (willRetry) {
      console.warn(`Encountered an error while crawling ${data}. ${err.message}\nThis job will be retried`);
    } else {
      console.error(`Failed to crawl ${data}: ${err.message}`);
    }
  });

  await cluster.task(async ({ page, data: url }) => {
    if (program.userAgent) {
      await page.setUserAgent(options.userAgent);
    }

    // load cookies if needed
    if (fs.existsSync('cookies/cookies-to-load.json')) {
      const cookiesString = fs.readFileSync('cookies/cookies-to-load.json', 'binary');
      const cookies = JSON.parse(cookiesString);
      await page.setCookie(...cookies);
    }

    const response = await page.goto(url);
    await page.waitForSelector('body');
    await processPage(page, url, response);
    const urlList = await page.evaluate(() => Array.from(document.querySelectorAll('a:not([href*="javascript"]'), a => a.href));
    urlList.forEach(url => {
      if (url.startsWith(URL) || url.startsWith(URL_RELATIVE)) {
        cluster.queue(url);
      }
    });
  });
  await cluster.queue(URL);
  await cluster.idle();
  await cluster.close();
})();
