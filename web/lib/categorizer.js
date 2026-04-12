export function categorizeTransaction(text, title) {
  const content = (text + " " + title).toLowerCase();

  const rules = [
    {
      category: "housing",
      keywords: ["rent", "maintenance", "brokerage", "hostel", "pg"],
    },
    {
      category: "transportation",
      keywords: [
        "uber",
        "ola",
        "irctc",
        "indigo",
        "petrol",
        "fuel",
        "metro",
        "rapido",
        "train",
        "flight",
      ],
    },
    {
      category: "groceries",
      keywords: [
        "blinkit",
        "zepto",
        "bigbasket",
        "instamart",
        "grocery",
        "milk",
        "vegetables",
      ],
    },
    {
      category: "utilities",
      keywords: ["electricity", "water", "bescom", "gas", "piped gas"],
    },
    {
      category: "entertainment",
      keywords: [
        "netflix",
        "pvr",
        "bookmyshow",
        "hotstar",
        "spotify",
        "prime video",
        "cinema",
        "movie",
        "gaming",
      ],
    },
    {
      category: "food",
      keywords: [
        "zomato",
        "swiggy",
        "starbucks",
        "restaurant",
        "mcdonalds",
        "kfc",
        "dine",
        "dinner",
        "lunch",
        "breakfast",
      ],
    },
    {
      category: "shopping",
      keywords: ["amazon", "flipkart", "myntra", "shopping", "mall", "ajio"],
    },
    {
      category: "healthcare",
      keywords: [
        "apollo",
        "pharmacy",
        "doctor",
        "hospital",
        "medicine",
        "pharmeasy",
        "clinic",
      ],
    },
    {
      category: "education",
      keywords: [
        "udemy",
        "coursera",
        "college",
        "fees",
        "books",
        "stationary",
        "tuition",
      ],
    },
    {
      category: "personal care",
      keywords: ["salon", "spa", "gym", "health", "barber", "nykaa", "makeup"],
    },
    {
      category: "travel",
      keywords: [
        "makeemytrip",
        "agoda",
        "hotel",
        "resort",
        "vacation",
        "airbnb",
      ],
    },
    {
      category: "insurance",
      keywords: ["lic", "policy", "premium", "insurance"],
    },
    {
      category: "gifts & donations",
      keywords: ["gift", "temple", "charity", "ngo", "donation", "shagun"],
    },
    {
      category: "bills & fees",
      keywords: [
        "jio",
        "airtel",
        "recharge",
        "broadband",
        "bill",
        "wi-fi",
        "postpaid",
      ],
    },
  ];

  for (let rule of rules) {
    if (rule.keywords.some((keyword) => content.includes(keyword))) {
      return rule.category;
    }
  }

  return "other expenses"; // Matches your UI exactly
}
