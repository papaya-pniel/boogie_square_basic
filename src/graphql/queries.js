export const listGrids = /* GraphQL */ `
  query ListGrids(
    $filter: ModelGridFilterInput
    $limit: Int
    $nextToken: String
    $sort: ModelGridSortInput
  ) {
    listGrids(filter: $filter, limit: $limit, nextToken: $nextToken, sort: $sort) {
      items {
        id
        name
        isActive
        status
        completedAt
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

export const getGrid = /* GraphQL */ `
  query GetGrid($id: ID!) {
    getGrid(id: $id) {
      id
      name
      isActive
      status
      completedAt
      createdAt
      updatedAt
    }
  }
`;

export const listVideos = /* GraphQL */ `
  query ListVideos(
    $filter: ModelVideoFilterInput
    $limit: Int
    $nextToken: String
    $sort: ModelVideoSortInput
  ) {
    listVideos(filter: $filter, limit: $limit, nextToken: $nextToken, sort: $sort) {
      items {
        id
        s3Key
        gridId
        userId
        position
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

export const getVideo = /* GraphQL */ `
  query GetVideo($id: ID!) {
    getVideo(id: $id) {
      id
      s3Key
      gridId
      userId
      position
      createdAt
      updatedAt
    }
  }
`;

export const listUsers = /* GraphQL */ `
  query ListUsers(
    $filter: ModelUserFilterInput
    $limit: Int
    $nextToken: String
    $sort: ModelUserSortInput
  ) {
    listUsers(filter: $filter, limit: $limit, nextToken: $nextToken, sort: $sort) {
      items {
        id
        email
        name
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

export const getUser = /* GraphQL */ `
  query GetUser($id: ID!) {
    getUser(id: $id) {
      id
      email
      name
      createdAt
      updatedAt
    }
  }
`;
