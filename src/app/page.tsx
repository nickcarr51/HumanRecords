import * as S from './page.styles';

export default function Home() {
  return (
    <S.Main>
      <S.Logo src="/human_records_main_logo.png" alt="Human Records" />
      <S.StatusTag>ACCESS BY INVITATION</S.StatusTag>
      <S.Wordmark>HUMAN SERVICES</S.Wordmark>
      <S.Subline>By Human Records</S.Subline>
    </S.Main>
  );
}
