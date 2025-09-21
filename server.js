const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Connect to MongoDB - using local database as fallback
const MONGODB_URI = "mongodb://localhost:27017/expenses";

mongoose
  .connect(
    "mongodb+srv://Mostafa:MostafaDiab@cluster0.ehu6rap.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("Could not connect to MongoDB", err);
    console.log("Using in-memory storage instead");
  });

// Define schema with validation
const transactionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    amount: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "salary",
        "freelance",
        "investment",
        "grocery",
        "eatingout",
        "transport",
        "entertainment",
        "shopping",
        "other",
      ],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    type: {
      type: String,
      required: true,
      enum: ["income", "expense"],
    },
  },
  {
    timestamps: true,
  }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

// In-memory storage fallback
let memoryStorage = [];

// Routes with error handling
app.post("/transactions", async (req, res) => {
  try {
    // If MongoDB is connected, use it
    if (mongoose.connection.readyState === 1) {
      const transaction = new Transaction(req.body);
      await transaction.save();
      return res.status(201).send(transaction);
    }

    // Otherwise use in-memory storage
    const transaction = {
      _id: Date.now().toString(),
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryStorage.push(transaction);
    res.status(201).send(transaction);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get("/transactions", async (req, res) => {
  try {
    const { type } = req.query;

    // If MongoDB is connected, use it
    if (mongoose.connection.readyState === 1) {
      let filter = {};

      if (type && (type === "income" || type === "expense")) {
        filter.type = type;
      }

      const transactions = await Transaction.find(filter).sort({ date: -1 });
      return res.send(transactions);
    }

    // Otherwise use in-memory storage
    let transactions = [...memoryStorage];
    if (type && (type === "income" || type === "expense")) {
      transactions = transactions.filter((t) => t.type === type);
    }
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.send(transactions);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/transactions/:id", async (req, res) => {
  try {
    // If MongoDB is connected, use it
    if (mongoose.connection.readyState === 1) {
      const transaction = await Transaction.findById(req.params.id);
      if (!transaction) {
        return res.status(404).send({ error: "Transaction not found" });
      }
      return res.send(transaction);
    }

    // Otherwise use in-memory storage
    const transaction = memoryStorage.find((t) => t._id === req.params.id);
    if (!transaction) {
      return res.status(404).send({ error: "Transaction not found" });
    }
    res.send(transaction);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.put("/transactions/:id", async (req, res) => {
  try {
    // If MongoDB is connected, use it
    if (mongoose.connection.readyState === 1) {
      const transaction = await Transaction.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

      if (!transaction) {
        return res.status(404).send({ error: "Transaction not found" });
      }

      return res.send(transaction);
    }

    // Otherwise use in-memory storage
    const index = memoryStorage.findIndex((t) => t._id === req.params.id);
    if (index === -1) {
      return res.status(404).send({ error: "Transaction not found" });
    }

    memoryStorage[index] = {
      ...memoryStorage[index],
      ...req.body,
      updatedAt: new Date(),
    };

    res.send(memoryStorage[index]);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.delete("/transactions/:id", async (req, res) => {
  try {
    // If MongoDB is connected, use it
    if (mongoose.connection.readyState === 1) {
      const transaction = await Transaction.findByIdAndDelete(req.params.id);

      if (!transaction) {
        return res.status(404).send({ error: "Transaction not found" });
      }

      return res.send({ message: "Transaction deleted successfully" });
    }

    // Otherwise use in-memory storage
    const index = memoryStorage.findIndex((t) => t._id === req.params.id);
    if (index === -1) {
      return res.status(404).send({ error: "Transaction not found" });
    }

    memoryStorage.splice(index, 1);
    res.send({ message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.delete("/transactions", async (req, res) => {
  try {
    // If MongoDB is connected, use it
    if (mongoose.connection.readyState === 1) {
      await Transaction.deleteMany({});
      return res.send({ message: "All transactions deleted successfully" });
    }

    // Otherwise use in-memory storage
    memoryStorage = [];
    res.send({ message: "All transactions deleted successfully" });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Get summary data
app.get("/summary", async (req, res) => {
  try {
    let transactions = [];

    // If MongoDB is connected, use it
    if (mongoose.connection.readyState === 1) {
      transactions = await Transaction.find();
    } else {
      // Otherwise use in-memory storage
      transactions = memoryStorage;
    }

    const total = transactions.reduce((acc, t) => acc + t.amount, 0);
    const income = transactions
      .filter((t) => t.type === "income")
      .reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => acc + Math.abs(t.amount), 0);

    res.send({
      balance: total,
      income,
      expense,
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 5000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
