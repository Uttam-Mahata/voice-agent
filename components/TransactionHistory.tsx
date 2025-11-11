import React from 'react';
import { MockTransaction } from '../mock/backend';
import { ArrowDownLeftIcon, ArrowUpRightIcon } from './icons';

interface TransactionHistoryProps {
  transactions: MockTransaction[];
  accountType: string | null;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, accountType }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg h-full flex flex-col">
      <h2 className="text-lg font-semibold text-teal-400 mb-4 border-b border-gray-700 pb-2">
        Transaction History
      </h2>
      {accountType ? (
        <div className="flex-grow overflow-y-auto">
          <p className="text-sm text-gray-400 mb-4">
            Showing recent transactions for your <span className="font-semibold text-teal-300">{accountType}</span> account.
          </p>
          {transactions.length > 0 ? (
            <ul className="space-y-3">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-full ${tx.type === 'credit' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                      {tx.type === 'credit' ? (
                        <ArrowUpRightIcon className="w-5 h-5 text-green-400" />
                      ) : (
                        <ArrowDownLeftIcon className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-200">{tx.description}</p>
                      <p className="text-xs text-gray-500">{tx.date}</p>
                    </div>
                  </div>
                  <p className={`font-semibold ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                    {tx.type === 'credit' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center text-gray-500 pt-10">
              <p>No transactions found for this account.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p>Ask the agent to see your transaction history.</p>
            <p className="text-xs mt-1">e.g., "Show my checking history."</p>
          </div>
        </div>
      )}
    </div>
  );
};
