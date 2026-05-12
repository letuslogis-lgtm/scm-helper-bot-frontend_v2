import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-gray-800 font-sans p-6">
            <div className="bg-white p-8 rounded-xl shadow-xl max-w-lg w-full text-center border border-gray-200">
                <div className="text-5xl mb-4">⚠️</div>
                <h1 className="text-2xl font-black text-red-600 mb-2">시스템 오류가 발생했습니다.</h1>
                <p className="text-sm text-gray-500 mb-6">일시적인 문제일 수 있습니다. 페이지를 새로고침 해보세요.</p>
                <div className="bg-red-50 text-red-800 text-left p-4 rounded-lg text-xs font-mono overflow-auto max-h-40 mb-6">
                    {this.state.error && this.state.error.toString()}
                </div>
                <button 
                    onClick={() => window.location.href = '/'} 
                    className="bg-letusBlue text-white font-bold py-2.5 px-6 rounded-lg hover:bg-blue-600 transition-colors shadow-sm"
                >
                    홈으로 돌아가기
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}
