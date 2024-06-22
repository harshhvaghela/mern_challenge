const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const port = 5000;

mongoose.connect('mongodb://localhost:27017/transactions', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const transactionSchema = new mongoose.Schema({
  id: Number,
  title: String,
  description: String,
  price: Number,
  dateOfSale: Date,
  category: String,
  sold: Boolean
});

const Transaction = mongoose.model('Transaction', transactionSchema);

app.get('/api/init', async (req, res) => {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    const data = response.data;
    await Transaction.insertMany(data);
    res.status(200).send('Database initialized with seed data.');
  } catch (error) {
    res.status(500).send('Error initializing database.');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

app.get('/api/transactions', async (req, res) => {
  const { month, search = '', page = 1, perPage = 10 } = req.query;
  const monthIndex = new Date(`${month} 1, 2020`).getMonth() + 1; // getMonth() is 0-based
  const regex = new RegExp(search, 'i');

  try {
    const transactions = await Transaction.find({
      dateOfSale: { $month: monthIndex },
      $or: [
        { title: regex },
        { description: regex },
        { price: { $regex: regex } }
      ]
    })
    .skip((page - 1) * perPage)
    .limit(parseInt(perPage));

    res.json(transactions);
  } catch (error) {
    res.status(500).send('Error fetching transactions.');
  }
});

app.get('/api/statistics', async (req, res) => {
  const { month } = req.query;
  const monthIndex = new Date(`${month} 1, 2020`).getMonth() + 1;

  try {
    const totalSaleAmount = await Transaction.aggregate([
      { $match: { dateOfSale: { $month: monthIndex }, sold: true } },
      { $group: { _id: null, total: { $sum: "$price" } } }
    ]);

    const totalSoldItems = await Transaction.countDocuments({ dateOfSale: { $month: monthIndex }, sold: true });
    const totalNotSoldItems = await Transaction.countDocuments({ dateOfSale: { $month: monthIndex }, sold: false });

    res.json({
      totalSaleAmount: totalSaleAmount[0] ? totalSaleAmount[0].total : 0,
      totalSoldItems,
      totalNotSoldItems
    });
  } catch (error) {
    res.status(500).send('Error fetching statistics.');
  }
});

app.get('/api/bar-chart', async (req, res) => {
  const { month } = req.query;
  const monthIndex = new Date(`${month} 1, 2020`).getMonth() + 1;

  try {
    const priceRanges = [
      { range: '0-100', min: 0, max: 100 },
      { range: '101-200', min: 101, max: 200 },
      { range: '201-300', min: 201, max: 300 },
      { range: '301-400', min: 301, max: 400 },
      { range: '401-500', min: 401, max: 500 },
      { range: '501-600', min: 501, max: 600 },
      { range: '601-700', min: 601, max: 700 },
      { range: '701-800', min: 701, max: 800 },
      { range: '801-900', min: 801, max: 900 },
      { range: '901-above', min: 901, max: Infinity }
    ];

    const barChartData = await Promise.all(priceRanges.map(async range => {
      const count = await Transaction.countDocuments({
        dateOfSale: { $month: monthIndex },
        price: { $gte: range.min, $lte: range.max }
      });

      return { range: range.range, count };
    }));

    res.json(barChartData);
  } catch (error) {
    res.status(500).send('Error fetching bar chart data.');
  }
});

app.get('/api/pie-chart', async (req, res) => {
  const { month } = req.query;
  const monthIndex = new Date(`${month} 1, 2020`).getMonth() + 1;

  try {
    const pieChartData = await Transaction.aggregate([
      { $match: { dateOfSale: { $month: monthIndex } } },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]);

    res.json(pieChartData);
  } catch (error) {
    res.status(500).send('Error fetching pie chart data.');
  }
});

app.get('/api/combined', async (req, res) => {
  const { month } = req.query;

  try {
    const [transactions, statistics, barChartData, pieChartData] = await Promise.all([
      axios.get(`http://localhost:${port}/api/transactions`, { params: { month } }),
      axios.get(`http://localhost:${port}/api/statistics`, { params: { month } }),
      axios.get(`http://localhost:${port}/api/bar-chart`, { params: { month } }),
      axios.get(`http://localhost:${port}/api/pie-chart`, { params: { month } })
    ]);

    res.json({
      transactions: transactions.data,
      statistics: statistics.data,
      barChartData: barChartData.data,
      pieChartData: pieChartData.data
    });
  } catch (error) {
    res.status(500).send('Error fetching combined data.');
  }
});
