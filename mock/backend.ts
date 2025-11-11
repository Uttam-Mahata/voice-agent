export interface MockTransaction {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'debit' | 'credit';
}

const generateRandomTransactions = (accountType: 'checking' | 'savings', count: number): MockTransaction[] => {
    const transactions: MockTransaction[] = [];
    const descriptions = {
        checking: ['Grocery Store', 'Gas Station', 'Online Purchase', 'Coffee Shop', 'Restaurant', 'Utility Bill', 'Paycheck Deposit'],
        savings: ['Transfer from Checking', 'Interest Earned', 'Dividend Payment', 'Initial Deposit'],
    };
    const today = new Date();

    for (let i = 0; i < count; i++) {
        const isCredit = accountType === 'savings' ? Math.random() > 0.2 : Math.random() > 0.8;
        const randomDescription = descriptions[accountType][Math.floor(Math.random() * descriptions[accountType].length)];
        
        transactions.push({
            id: `${accountType}-${i}-${Date.now()}`,
            date: new Date(today.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            description: randomDescription,
            amount: parseFloat((Math.random() * (isCredit ? 500 : 200) + 5).toFixed(2)),
            type: isCredit ? 'credit' : 'debit',
        });
    }
    return transactions;
};

const mockData = {
    checking: generateRandomTransactions('checking', 20),
    savings: generateRandomTransactions('savings', 15),
};

export const getMockTransactionHistory = (accountType: 'checking' | 'savings', limit: number = 10): MockTransaction[] => {
    return mockData[accountType]?.slice(0, limit) || [];
};
