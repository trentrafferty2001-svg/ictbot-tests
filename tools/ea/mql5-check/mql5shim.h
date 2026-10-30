// A stand-in for MetaTrader 5's MQL5 API, just enough for a C++ compiler to
// check the exported Expert Advisors for typos, unknown names, wrong argument
// counts and bad types (tools/ea/mql5-check/check.js). It is NOT MQL5: the
// real test is compiling in MetaEditor. Added 2026-10-30.
#pragma once
#include <string>
#include <climits>
typedef long long datetime;
typedef unsigned long ulong;
typedef unsigned int uint;
struct string {
  std::string s;
  string() {}
  string(const char *c) : s(c) {}
  string(const std::string &x) : s(x) {}
  explicit string(double) {}
  explicit string(int) {}
  explicit string(long) {}
  explicit string(ulong) {}
};
inline string operator+(const string &a, const string &b) { return string(a.s + b.s); }
inline string operator+(const char *a, const string &b) { return string(std::string(a) + b.s); }
inline string operator+(const string &a, const char *b) { return string(a.s + b); }
inline bool operator==(const string &a, const string &b) { return a.s == b.s; }
inline bool operator!=(const string &a, const string &b) { return a.s != b.s; }
enum ENUM_TIMEFRAMES { PERIOD_CURRENT = 0, PERIOD_M1 = 1, PERIOD_M5 = 5, PERIOD_M15 = 15, PERIOD_M30 = 30, PERIOD_H1 = 16385, PERIOD_H4 = 16388, PERIOD_D1 = 16408 };
enum ENUM_MA_METHOD { MODE_SMA, MODE_EMA, MODE_SMMA, MODE_LWMA };
enum ENUM_APPLIED_PRICE { PRICE_CLOSE = 1, PRICE_OPEN, PRICE_HIGH, PRICE_LOW, PRICE_MEDIAN, PRICE_TYPICAL, PRICE_WEIGHTED };
enum ENUM_STO_PRICE { STO_LOWHIGH, STO_CLOSECLOSE };
enum ENUM_SERIESMODE { MODE_OPEN, MODE_LOW, MODE_HIGH, MODE_CLOSE, MODE_VOLUME, MODE_REAL_VOLUME, MODE_SPREAD };
enum ENUM_POSITION_PROPERTY_INTEGER { POSITION_TIME, POSITION_TYPE, POSITION_MAGIC, POSITION_IDENTIFIER, POSITION_TICKET };
enum ENUM_POSITION_PROPERTY_DOUBLE { POSITION_VOLUME, POSITION_PRICE_OPEN, POSITION_SL, POSITION_TP, POSITION_PRICE_CURRENT, POSITION_PROFIT };
enum ENUM_POSITION_PROPERTY_STRING { POSITION_SYMBOL, POSITION_COMMENT };
enum ENUM_POSITION_TYPE { POSITION_TYPE_BUY, POSITION_TYPE_SELL };
enum ENUM_SYMBOL_INFO_DOUBLE { SYMBOL_BID, SYMBOL_ASK, SYMBOL_POINT, SYMBOL_TRADE_TICK_VALUE_LOSS, SYMBOL_TRADE_TICK_SIZE, SYMBOL_VOLUME_STEP, SYMBOL_VOLUME_MIN, SYMBOL_VOLUME_MAX };
enum ENUM_SYMBOL_INFO_INTEGER { SYMBOL_TRADE_STOPS_LEVEL, SYMBOL_DIGITS };
enum ENUM_ACCOUNT_INFO_DOUBLE { ACCOUNT_BALANCE, ACCOUNT_EQUITY };
enum ENUM_INIT_RETCODE { INIT_SUCCEEDED = 0, INIT_FAILED = 1 };
#define INVALID_HANDLE (-1)
#define EMPTY_VALUE (1.7976931348623157e308)
#define TRADE_RETCODE_PLACED 10008
#define TRADE_RETCODE_DONE 10009
extern string _Symbol; extern double _Point; extern int _Digits;
struct MqlDateTime { int year, mon, day, hour, min, sec, day_of_week, day_of_year; };
int iMA(const string &, ENUM_TIMEFRAMES, int, int, ENUM_MA_METHOD, ENUM_APPLIED_PRICE);
int iRSI(const string &, ENUM_TIMEFRAMES, int, ENUM_APPLIED_PRICE);
int iATR(const string &, ENUM_TIMEFRAMES, int);
int iMACD(const string &, ENUM_TIMEFRAMES, int, int, int, ENUM_APPLIED_PRICE);
int iBands(const string &, ENUM_TIMEFRAMES, int, int, double, ENUM_APPLIED_PRICE);
int iStochastic(const string &, ENUM_TIMEFRAMES, int, int, int, ENUM_MA_METHOD, ENUM_STO_PRICE);
int iADX(const string &, ENUM_TIMEFRAMES, int);
int iCCI(const string &, ENUM_TIMEFRAMES, int, ENUM_APPLIED_PRICE);
int iMomentum(const string &, ENUM_TIMEFRAMES, int, ENUM_APPLIED_PRICE);
int iStdDev(const string &, ENUM_TIMEFRAMES, int, int, ENUM_MA_METHOD, ENUM_APPLIED_PRICE);
int CopyBuffer(int, int, int, int, double *);
datetime iTime(const string &, ENUM_TIMEFRAMES, int);
double iOpen(const string &, ENUM_TIMEFRAMES, int);
double iHigh(const string &, ENUM_TIMEFRAMES, int);
double iLow(const string &, ENUM_TIMEFRAMES, int);
double iClose(const string &, ENUM_TIMEFRAMES, int);
long iVolume(const string &, ENUM_TIMEFRAMES, int);
int iHighest(const string &, ENUM_TIMEFRAMES, ENUM_SERIESMODE, int, int);
int iLowest(const string &, ENUM_TIMEFRAMES, ENUM_SERIESMODE, int, int);
int iBarShift(const string &, ENUM_TIMEFRAMES, datetime, bool);
bool IndicatorRelease(int);
bool TimeToStruct(datetime, MqlDateTime &);
datetime TimeCurrent();
double SymbolInfoDouble(const string &, ENUM_SYMBOL_INFO_DOUBLE);
long SymbolInfoInteger(const string &, ENUM_SYMBOL_INFO_INTEGER);
double AccountInfoDouble(ENUM_ACCOUNT_INFO_DOUBLE);
int PositionsTotal();
ulong PositionGetTicket(int);
bool PositionSelectByTicket(ulong);
long PositionGetInteger(ENUM_POSITION_PROPERTY_INTEGER);
double PositionGetDouble(ENUM_POSITION_PROPERTY_DOUBLE);
string PositionGetString(ENUM_POSITION_PROPERTY_STRING);
datetime GlobalVariableSet(const string &, double);
double GlobalVariableGet(const string &);
bool GlobalVariableCheck(const string &);
double NormalizeDouble(double, int);
double MathAbs(double); double MathMax(double, double); double MathMin(double, double); double MathFloor(double);
string DoubleToString(double, int);
string IntegerToString(long);
string EnumToString(ENUM_TIMEFRAMES);
template <typename... T> void Print(const T &...) {}
class CTrade {
 public:
  void SetExpertMagicNumber(ulong);
  void SetDeviationInPoints(ulong);
  bool Buy(double, const string & = string(), double = 0.0, double = 0.0, double = 0.0, const string & = string());
  bool Sell(double, const string & = string(), double = 0.0, double = 0.0, double = 0.0, const string & = string());
  bool PositionClose(ulong, ulong = ULONG_MAX);
  bool PositionModify(ulong, double, double);
  uint ResultRetcode();
  string ResultRetcodeDescription();
  ulong ResultOrder();
};
